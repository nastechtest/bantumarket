<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * A row that cannot be indexed as it stands: a missing field, a field outside
 * the projection's closed column list, or a value the enums do not define.
 *
 * The index is an index, not a source of truth. When a producer sends a shape
 * the projection does not understand, refusing is the only honest answer:
 * guessing a value makes the index disagree with the listing it claims to show.
 */
class SearchProjectionRefused extends \InvalidArgumentException
{
}
