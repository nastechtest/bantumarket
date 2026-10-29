<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * A category row or lifecycle move that the taxonomy refuses.
 *
 * Slug shape, a self-parent, a second level under a child, a merge that names
 * itself, or a live category with no current version all land here.
 */
final class InvalidCategory extends CatalogueRefused
{
}
