<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * The query model: text terms, four filters, a sort key and a window.
 *
 * Constructed only from the wire-shaped array, so there is exactly one place
 * that decides what a query means. Unknown parameter names, filter names, sort
 * keys and facet values are refused here. The rule that makes this worth a class
 * is the negative one: a filter is never silently dropped to make a query
 * succeed, because the buyer cannot tell an ignored filter from a respected one.
 *
 * Matching semantics, stated once:
 *   - every term must appear (AND), case-insensitively, in the title or the
 *     category path; an empty term list means "browse";
 *   - filters are conjunctive;
 *   - `category` matches the exact path or any descendant at a segment
 *     boundary, so "watches" matches "watches/pre-owned/divers" but not
 *     "watches-and-clocks".
 */
final class SearchQuery
{
    /**
     * @var list<string>
     */
    public const ALLOWED_PARAMETERS = ['filters', 'limit', 'offset', 'q', 'sort'];

    /**
     * @var list<string>
     */
    public const ALLOWED_FILTERS = ['category', 'condition', 'has3d', 'price_bucket'];

    public const MAX_TERMS = 8;
    public const MAX_TERM_LENGTH = 64;
    public const DEFAULT_LIMIT = 20;
    public const MAX_LIMIT = 100;

    /**
     * @param list<string> $terms
     */
    private function __construct(
        public readonly array $terms,
        public readonly ?string $category,
        public readonly ?Condition $condition,
        public readonly ?bool $has3d,
        public readonly ?PriceBucket $priceBucket,
        public readonly SortKey $sort,
        public readonly int $offset,
        public readonly int $limit,
    ) {
    }

    /**
     * @param array<string,mixed> $input
     */
    public static function fromArray(array $input): self
    {
        foreach (array_keys($input) as $key) {
            if (!is_string($key) || !in_array($key, self::ALLOWED_PARAMETERS, true)) {
                throw new InvalidSearchQuery(sprintf(
                    'Unknown search parameter "%s". Allowed parameters: %s.',
                    (string) $key,
                    implode(', ', self::ALLOWED_PARAMETERS),
                ));
            }
        }

        $terms = self::parseTerms($input['q'] ?? '');

        $filters = $input['filters'] ?? [];
        if (!is_array($filters)) {
            throw new InvalidSearchQuery('Search filters must be an object of named filters, not a list');
        }

        $category = null;
        $condition = null;
        $has3d = null;
        $priceBucket = null;

        foreach ($filters as $name => $value) {
            if (!is_string($name) || !in_array($name, self::ALLOWED_FILTERS, true)) {
                throw new UnknownSearchFilter(sprintf(
                    'Unknown search filter "%s". Allowed filters: %s. '
                    . 'A query is refused rather than answered without the filter you asked for.',
                    (string) $name,
                    implode(', ', self::ALLOWED_FILTERS),
                ));
            }

            switch ($name) {
                case 'category':
                    if (!is_string($value) || preg_match('~' . SearchDocument::CATEGORY_PATH_PATTERN . '~', $value) !== 1) {
                        throw new InvalidSearchQuery(
                            'Filter "category" must be a lowercase slug path such as "watches/pre-owned".',
                        );
                    }
                    $category = $value;
                    break;

                case 'condition':
                    if (!is_string($value) || ($condition = Condition::tryFrom($value)) === null) {
                        throw new InvalidSearchQuery(sprintf(
                            'Unknown condition "%s". Known conditions: %s.',
                            is_string($value) ? $value : get_debug_type($value),
                            implode(', ', Condition::values()),
                        ));
                    }
                    break;

                case 'has3d':
                    if (!is_bool($value)) {
                        throw new InvalidSearchQuery(
                            'Filter "has3d" must be true or false; a string is how "false" becomes true.',
                        );
                    }
                    $has3d = $value;
                    break;

                case 'price_bucket':
                    if (!is_string($value) || ($priceBucket = PriceBucket::tryFrom($value)) === null) {
                        throw new InvalidSearchQuery(sprintf(
                            'Unknown price bucket "%s". Known buckets: %s.',
                            is_string($value) ? $value : get_debug_type($value),
                            implode(', ', PriceBucket::values()),
                        ));
                    }
                    break;
            }
        }

        $sortValue = $input['sort'] ?? SortKey::Relevance->value;
        if (!is_string($sortValue) || ($sort = SortKey::tryFrom($sortValue)) === null) {
            throw new UnknownSortKey(sprintf(
                'Unknown sort "%s". Allowed sorts: %s. '
                . 'Falling back to relevance would reorder a comparison without saying so.',
                is_string($sortValue) ? $sortValue : get_debug_type($sortValue),
                implode(', ', SortKey::values()),
            ));
        }

        $offset = $input['offset'] ?? 0;
        if (!is_int($offset) || $offset < 0) {
            throw new InvalidSearchQuery('Search offset must be a non-negative integer');
        }

        $limit = $input['limit'] ?? self::DEFAULT_LIMIT;
        if (!is_int($limit) || $limit < 1 || $limit > self::MAX_LIMIT) {
            throw new InvalidSearchQuery(sprintf(
                'Search limit must be an integer between 1 and %d',
                self::MAX_LIMIT,
            ));
        }

        return new self($terms, $category, $condition, $has3d, $priceBucket, $sort, $offset, $limit);
    }

    /**
     * @return list<string>
     */
    private static function parseTerms(mixed $q): array
    {
        if (!is_string($q)) {
            throw new InvalidSearchQuery('Search terms must be a string');
        }

        $trimmed = trim($q);
        if ($trimmed === '') {
            return [];
        }

        $terms = [];
        foreach (preg_split('/\s+/', $trimmed) ?: [] as $raw) {
            $term = strtolower($raw);
            if (strlen($term) > self::MAX_TERM_LENGTH) {
                throw new InvalidSearchQuery(sprintf(
                    'Search term "%s" is longer than %d characters',
                    $term,
                    self::MAX_TERM_LENGTH,
                ));
            }
            if (!in_array($term, $terms, true)) {
                $terms[] = $term;
            }
            if (count($terms) > self::MAX_TERMS) {
                throw new InvalidSearchQuery(sprintf(
                    'Search accepts at most %d distinct terms',
                    self::MAX_TERMS,
                ));
            }
        }

        return $terms;
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        $filters = [];
        if ($this->category !== null) {
            $filters['category'] = $this->category;
        }
        if ($this->condition !== null) {
            $filters['condition'] = $this->condition->value;
        }
        if ($this->has3d !== null) {
            $filters['has3d'] = $this->has3d;
        }
        if ($this->priceBucket !== null) {
            $filters['price_bucket'] = $this->priceBucket->value;
        }

        return [
            'q' => implode(' ', $this->terms),
            'filters' => $filters,
            'sort' => $this->sort->value,
            'offset' => $this->offset,
            'limit' => $this->limit,
        ];
    }
}
