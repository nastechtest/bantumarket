<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * A media row was saved at a version that is not the one the caller loaded.
 *
 * Two handlers can race on one record — a capture pipeline publishing while an
 * operator retires, an erasure sweep while a verification lands — and the loser
 * must fail loudly rather than quietly restore a state the winner moved past.
 * `media.assets_version_monotonic` is the same refusal at the storage layer, for
 * the writes that never load an aggregate.
 */
final class StaleMediaVersion extends \DomainException
{
}
