<?php

declare(strict_types=1);

namespace NasTech\Search;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Persistence\Store;

/**
 * The index over a Store. No source module is read: documents are handed in by
 * the adapter that owns the source snapshot, which is what keeps Search a pure
 * projection and gives it a rebuild path that does not depend on another
 * module's PHP classes.
 *
 * The two write rules:
 *   - a source version may not go backwards. An at-least-once feed will replay
 *     old events; the stored version wins.
 *   - a source version may not describe two different rows. If it did, a
 *     rebuild could not decide which row is current.
 *
 * Search only ever returns active rows. An inactive row is kept so a rebuild
 * still has evidence that the listing was seen; it cannot appear in a result.
 */
final class InMemorySearchIndex implements SearchIndex
{
    public function __construct(
        private readonly Store $store,
        private readonly Clock $clock,
    ) {
    }

    public function index(SearchDocument $document): string
    {
        $existing = $this->store->find('search_documents', $document->listingId);
        $row = $document->toRow();

        if ($existing === null) {
            $row['indexed_at'] = $this->clock->now()->format(\DateTimeInterface::ATOM);
            $this->store->insert('search_documents', $row);

            return self::INDEXED;
        }

        $stored = SearchDocument::fromRow($existing);

        if ($document->sourceVersion < $stored->sourceVersion) {
            throw new StaleIndexWrite(sprintf(
                'Listing %s cannot be indexed at source version %d: the index already holds version %d. '
                . 'A replayed older event must not undo a newer projection.',
                $document->listingId,
                $document->sourceVersion,
                $stored->sourceVersion,
            ));
        }

        if ($document->sourceVersion === $stored->sourceVersion) {
            if ($document->contentEquals($stored)) {
                return self::UNCHANGED;
            }

            throw new VersionReused(sprintf(
                'Listing %s cannot be indexed at source version %d: that version was already used for different content. '
                . 'A version that means two things cannot make a rebuild idempotent.',
                $document->listingId,
                $document->sourceVersion,
            ));
        }

        $row['indexed_at'] = $this->clock->now()->format(\DateTimeInterface::ATOM);
        $this->store->update('search_documents', $row);

        return self::INDEXED;
    }

    public function rebuild(array $documents): RebuildReport
    {
        $seen = [];
        $indexed = 0;
        $unchanged = 0;

        foreach ($documents as $document) {
            if (!$document instanceof SearchDocument) {
                throw new SearchProjectionRefused('A rebuild accepts SearchDocument rows only');
            }
            if (isset($seen[$document->listingId])) {
                throw new SearchProjectionRefused(sprintf(
                    'Listing %s appears twice in one rebuild; the result would depend on input order.',
                    $document->listingId,
                ));
            }
            $seen[$document->listingId] = true;

            if ($this->index($document) === self::INDEXED) {
                $indexed++;
            } else {
                $unchanged++;
            }
        }

        return new RebuildReport(count($documents), $indexed, $unchanged);
    }

    public function search(SearchQuery $query): SearchPage
    {
        $matches = $this->matches($query);
        $total = count($matches);

        $hits = [];
        foreach (array_slice($matches, $query->offset, $query->limit) as $match) {
            $hits[] = new SearchHit($match['document'], $match['explanation']);
        }

        return new SearchPage($hits, $total, $query->offset, $query->limit);
    }

    public function explain(SearchQuery $query): array
    {
        return array_map(
            static fn (array $match): SearchExplanation => $match['explanation'],
            $this->matches($query),
        );
    }

    public function document(string $listingId): ?SearchDocument
    {
        $row = $this->store->find('search_documents', $listingId);

        return $row === null ? null : SearchDocument::fromRow($row);
    }

    public function staleAgainst(array $sourceVersions): array
    {
        $stale = [];

        foreach ($sourceVersions as $listingId => $version) {
            if (!is_string($listingId) || !is_int($version) || $version < 1) {
                throw new SearchProjectionRefused(
                    'staleAgainst() takes listing ids mapped to positive integer source versions',
                );
            }

            $row = $this->store->find('search_documents', $listingId);
            if ($row === null) {
                continue;
            }
            if ((int) $row['source_version'] < $version) {
                $stale[] = $listingId;
            }
        }

        sort($stale);

        return $stale;
    }

    /**
     * @return list<array{document: SearchDocument, explanation: SearchExplanation}>
     */
    private function matches(SearchQuery $query): array
    {
        $matches = [];

        foreach ($this->store->all('search_documents') as $row) {
            $document = SearchDocument::fromRow($row);
            if (!$document->active) {
                continue;
            }

            $explanation = $this->explainOne($query, $document);
            if ($explanation !== null) {
                $matches[] = ['document' => $document, 'explanation' => $explanation];
            }
        }

        usort($matches, static fn (array $a, array $b): int => self::compare($a, $b, $query->sort));

        return $matches;
    }

    /**
     * The explainable match rule. Terms are conjunctive; each one must occur in
     * the title or the category path. Filters are conjunctive and each records
     * the value that satisfied it. Score is 100 per term plus 10 per filter, so
     * the number in the explanation is reproducible from the lists beside it.
     */
    private function explainOne(SearchQuery $query, SearchDocument $document): ?SearchExplanation
    {
        $title = strtolower($document->title);
        $path = strtolower($document->categoryPath);

        $matchedTerms = [];
        foreach ($query->terms as $term) {
            if (str_contains($title, $term)) {
                $matchedTerms[$term] = 'title';
            } elseif (str_contains($path, $term)) {
                $matchedTerms[$term] = 'category_path';
            } else {
                return null;
            }
        }

        $matchedFilters = [];

        if ($query->category !== null) {
            $category = $query->category;
            if ($document->categoryPath !== $category && !str_starts_with($document->categoryPath, $category . '/')) {
                return null;
            }
            $matchedFilters['category'] = 'category_path is ' . $category . ' or below';
        }

        if ($query->condition !== null) {
            if ($document->condition !== $query->condition) {
                return null;
            }
            $matchedFilters['condition'] = 'condition is ' . $document->condition->value;
        }

        if ($query->has3d !== null) {
            if ($document->has3d !== $query->has3d) {
                return null;
            }
            $matchedFilters['has3d'] = 'has_3d is ' . ($document->has3d ? 'true' : 'false');
        }

        if ($query->priceBucket !== null) {
            if (!$query->priceBucket->contains($document->priceCents)) {
                return null;
            }
            $upper = $query->priceBucket->upperCents();
            $matchedFilters['price_bucket'] = sprintf(
                'price_cents %d is in %s [%d, %s)',
                $document->priceCents,
                $query->priceBucket->value,
                $query->priceBucket->lowerCents(),
                $upper === null ? 'unbounded' : (string) $upper,
            );
        }

        return new SearchExplanation(
            listingId: $document->listingId,
            score: count($matchedTerms) * 100 + count($matchedFilters) * 10,
            matchedTerms: $matchedTerms,
            matchedFilters: $matchedFilters,
            sort: $query->sort,
        );
    }

    /**
     * @param array{document: SearchDocument, explanation: SearchExplanation} $a
     * @param array{document: SearchDocument, explanation: SearchExplanation} $b
     */
    private static function compare(array $a, array $b, SortKey $sort): int
    {
        $left = $a['document'];
        $right = $b['document'];

        $order = match ($sort) {
            SortKey::Relevance => $b['explanation']->score <=> $a['explanation']->score,
            SortKey::PriceAsc => $left->priceCents <=> $right->priceCents,
            SortKey::PriceDesc => $right->priceCents <=> $left->priceCents,
            SortKey::Recent => $right->publishedAt <=> $left->publishedAt,
        };
        if ($order !== 0) {
            return $order;
        }

        if ($sort !== SortKey::Relevance) {
            $order = $b['explanation']->score <=> $a['explanation']->score;
            if ($order !== 0) {
                return $order;
            }
        }

        $order = $right->publishedAt <=> $left->publishedAt;
        if ($order !== 0) {
            return $order;
        }

        return strcmp($left->listingId, $right->listingId);
    }
}
