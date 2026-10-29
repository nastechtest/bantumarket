<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * The condition vocabulary is the buyer-facing one from the search contract:
 * `mint | excellent | good | worn`. It is duplicated here rather than imported
 * from the web app because a PHP module cannot depend on a TypeScript package,
 * and because this is a closed vocabulary, not a free-text field: a seller
 * cannot invent "almost mint" and have it become a facet.
 */
enum Condition: string
{
    case Mint = 'mint';
    case Excellent = 'excellent';
    case Good = 'good';
    case Worn = 'worn';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
