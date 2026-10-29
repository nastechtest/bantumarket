<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * Who is standing behind an attribute value.
 *
 * NasTech does not put a watch on a pressure bench, so a water-resistance figure
 * is the seller's statement. `STATED_BY_SELLER` therefore requires a non-empty
 * disclaimer at definition time, in PHP and in the DDL alike.
 */
enum Provenance: string
{
    case StatedBySeller = 'STATED_BY_SELLER';
    case MeasuredByPlatform = 'MEASURED_BY_PLATFORM';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
