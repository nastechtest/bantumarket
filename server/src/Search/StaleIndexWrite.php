<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * An older source version was offered to a newer index row.
 *
 * Projection input arrives from an at-least-once stream and from manual rebuilds;
 * a replayed old event must not undo a newer projection. The row's source_version
 * is the comparison, and the comparison fails towards keeping the newer row.
 */
final class StaleIndexWrite extends \RuntimeException
{
}
