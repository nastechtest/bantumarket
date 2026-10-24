<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * A retention rule stopped the deletion.
 *
 * This is the error a caller should receive when they ask to purge a record that a
 * dispute still needs, and it is deliberately not a subclass of MediaRefused: an
 * erasure request that "succeeded" by throwing away evidence is a compliance
 * failure, so the sweep that hits one has to stop and be seen to stop.
 */
final class RetentionRefused extends \DomainException
{
}
