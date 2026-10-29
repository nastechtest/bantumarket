<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * A page of results with the total before the window.
 *
 * `total` is the number of matches, not the number of indexed documents and not
 * an estimate: a buyer deciding whether to narrow a facet needs the count the
 * current query actually produced.
 */
final class SearchPage
{
    /**
     * @param list<SearchHit> $hits
     */
    public function __construct(
        public readonly array $hits,
        public readonly int $total,
        public readonly int $offset,
        public readonly int $limit,
    ) {
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'total' => $this->total,
            'offset' => $this->offset,
            'limit' => $this->limit,
            'hits' => array_map(static fn (SearchHit $hit): array => $hit->toArray(), $this->hits),
        ];
    }
}
