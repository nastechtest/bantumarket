<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * The category moved between load and save.
 *
 * Mirrors the revision-monotonic trigger in the DDL: a stale aggregate cannot
 * overwrite a newer row, even by code that forgot to compare.
 */
final class StaleCategoryVersion extends CatalogueRefused
{
    public function __construct(string $categoryId, int $expected, int $actual)
    {
        parent::__construct(sprintf(
            'Category %s was at revision %d when loaded but revision %d when saved; reload and retry',
            $categoryId,
            $expected,
            $actual,
        ));
    }
}
