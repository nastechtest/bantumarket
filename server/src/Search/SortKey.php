<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * The closed sort vocabulary. These four keys are the search contract's
 * `SortKey` (`relevance | price_asc | price_desc | recent`).
 *
 * There is deliberately no "recommended" or "personalised" member: ranking
 * takes no buyer identity, so the same query answers the same way for every
 * caller and can be explained from the row alone.
 */
enum SortKey: string
{
    case Relevance = 'relevance';
    case PriceAsc = 'price_asc';
    case PriceDesc = 'price_desc';
    case Recent = 'recent';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
