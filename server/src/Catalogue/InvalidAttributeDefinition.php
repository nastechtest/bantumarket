<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * An attribute definition that cannot answer a question consistently.
 *
 * The DDL's unit, option, bound and provenance rules are repeated here so the
 * in-memory tests reject the same shapes PostgreSQL would reject at INSERT.
 */
final class InvalidAttributeDefinition extends CatalogueRefused
{
}
