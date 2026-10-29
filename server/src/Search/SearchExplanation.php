<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * Why one row matched: the term that was found and where, and the filters the
 * row satisfied. This is the whole ranking story.
 *
 * There is no "because we think you will like it" field to leave out: ranking
 * counts matched terms and matched filters, both of which are values in the row.
 * The debug/explain call returns these objects, so a buyer support agent can
 * answer "why is this in my results?" without reading the index.
 */
final class SearchExplanation
{
    /**
     * @param array<string,string> $matchedTerms   term => "title" | "category_path"
     * @param array<string,string> $matchedFilters filter => the row value that satisfied it
     */
    public function __construct(
        public readonly string $listingId,
        public readonly int $score,
        public readonly array $matchedTerms,
        public readonly array $matchedFilters,
        public readonly SortKey $sort,
    ) {
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'listing_id' => $this->listingId,
            'score' => $this->score,
            'matched_terms' => $this->matchedTerms,
            'matched_filters' => $this->matchedFilters,
            'sort' => $this->sort->value,
        ];
    }
}
