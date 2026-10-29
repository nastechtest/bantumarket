<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * A sort key outside the closed vocabulary. A misspelled sort falling back to
 * relevance would reorder a price comparison without saying so.
 */
final class UnknownSortKey extends InvalidSearchQuery
{
}
