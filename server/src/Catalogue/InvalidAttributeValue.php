<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * An answer was supplied for a known attribute but is not a value of its type,
 * or falls outside the frozen option/bound set.
 *
 * The name says "invalid", not "coerced": "36" is not 36, 1 is not true, and
 * "10 bar" is not an integer-range answer. The constructor never rewrites the
 * value, because rewriting is how a facet and a listing start disagreeing.
 */
final class InvalidAttributeValue extends CatalogueRefused
{
    public function __construct(string $code, string $reason)
    {
        parent::__construct(sprintf('Attribute "%s" was refused: %s', $code, $reason));
    }
}
