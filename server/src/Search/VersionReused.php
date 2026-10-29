<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * One source version was used for two different projection rows.
 *
 * A version that can mean two things is not a version. Allowing it would make
 * "the index is at version 7" unanswerable and a rebuild unable to decide which
 * row is current, so the second shape is refused instead of silently overwriting.
 */
final class VersionReused extends \RuntimeException
{
}
