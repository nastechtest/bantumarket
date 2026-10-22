<?php

declare(strict_types=1);

namespace NasTech\Handover;

/**
 * What to tell the party who just presented a PIN, and nothing they can use to
 * probe the other side's state.
 */
final class ConfirmationResult
{
    public function __construct(
        public readonly bool $accepted,
        public readonly bool $complete,
        public readonly ?string $awaiting,
        public readonly int $attemptsRemaining,
        public readonly bool $locked = false,
    ) {
    }
}
