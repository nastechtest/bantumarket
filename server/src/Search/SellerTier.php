<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * Seller verification tiers, exactly the five Identity grants (005_identity.sql).
 *
 * Search stores the tier, never the seller. A tier is a public statement about
 * a listing's provenance; a seller id is a handle into Identity, and joining
 * the index to an account is how a result page acquires a person.
 */
enum SellerTier: string
{
    case T1 = 'T1';
    case T2 = 'T2';
    case T3 = 'T3';
    case T4 = 'T4';
    case T5 = 'T5';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
