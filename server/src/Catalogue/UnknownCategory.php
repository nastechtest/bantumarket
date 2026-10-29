<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * The category a listing or a command named does not exist.
 *
 * A category id is the one thing every listing validation starts from. Treating
 * an unknown id as "no restrictions" is how a listing gets published against a
 * vocabulary nobody can render, so it is refused before any attribute is read.
 */
final class UnknownCategory extends CatalogueRefused
{
    public function __construct(string $categoryId)
    {
        parent::__construct("Unknown category: {$categoryId}");
    }
}
