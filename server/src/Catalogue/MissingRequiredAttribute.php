<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * A binding marked mandatory has no answer in the bag.
 *
 * This is the water-resistance rule in validation form: the question the pilot
 * category exists to ask cannot be omitted, and an empty string is not an answer
 * unless the type says it is (none of the launch types do).
 */
final class MissingRequiredAttribute extends CatalogueRefused
{
    public function __construct(string $code, string $categoryVersionId)
    {
        parent::__construct(sprintf(
            'Required attribute "%s" is missing from the listing; category version %s will not accept a partial answer set',
            $code,
            $categoryVersionId,
        ));
    }
}
