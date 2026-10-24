<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The account row moved under this aggregate between load and save. Same
 * failure class StaleOrderVersion names for the money path; here it matters
 * most against the erasure race — the loser must not silently re-write
 * anonymised columns with pre-erasure values.
 */
final class StaleAccountVersion extends \DomainException
{
}
