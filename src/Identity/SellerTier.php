<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The tier a subject has been *granted*, as the wire carries it.
 *
 * Named for the seller because that is what the contract field is called
 * (`sellerTier` in packages/api-contracts); the values are that contract's
 * five, transcribed — Identity stores a grant decision made by another module
 * and computes nothing. This type has no trustworthiness predicate and no
 * implied ladder: the labels are statements about one proof each ("ID
 * checked", "Item inspected") and the ban on reading a tier as a person's
 * standing is spec §13.2, not taste.
 */
enum SellerTier: string
{
    case T1 = 'T1';
    case T2 = 'T2';
    case T3 = 'T3';
    case T4 = 'T4';
    case T5 = 'T5';

    /**
     * The wire vocabulary, sorted — compared against the DDL's IN list by
     * tests/Identity/IdentityDdlTest.php, the same drift defence
     * SchemaParityTest runs against the money path.
     *
     * @return list<string>
     */
    public static function wireValues(): array
    {
        return array_map(static fn (self $t): string => $t->value, self::cases());
    }
}
