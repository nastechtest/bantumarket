<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * The attribute bag carries a key the category does not ask about.
 *
 * Refusing rather than dropping is deliberate. A silently ignored extra answer
 * is a seller statement the buyer can never see, and a facet that later learns
 * the key would start counting listings it did not validate.
 */
final class UnknownAttribute extends CatalogueRefused
{
    public function __construct(string $code, string $categoryVersionId)
    {
        parent::__construct(sprintf(
            'Attribute "%s" is not part of category version %s; the bag cannot carry answers the category never asked for',
            $code,
            $categoryVersionId,
        ));
    }
}
