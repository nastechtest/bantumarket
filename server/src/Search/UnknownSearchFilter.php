<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * A filter key outside the closed vocabulary.
 *
 * Ignoring it is the failure mode this class exists to prevent: the buyer sees
 * rows that do not satisfy the facet they selected, and the page looks correct.
 */
final class UnknownSearchFilter extends InvalidSearchQuery
{
}
