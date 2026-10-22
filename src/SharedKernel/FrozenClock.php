<?php

declare(strict_types=1);

namespace NasTech\SharedKernel;

/**
 * A clock the test suite controls. Token expiry, policy windows and webhook
 * clock skew are all time-dependent, and an assertion that passes only before
 * some hour of the day is not an assertion.
 */
final class FrozenClock implements Clock
{
    public function __construct(private \DateTimeImmutable $instant)
    {
    }

    public static function at(string $iso): self
    {
        return new self(new \DateTimeImmutable($iso));
    }

    public function now(): \DateTimeImmutable
    {
        return $this->instant;
    }

    public function advance(string $interval): void
    {
        $this->instant = $this->instant->add(new \DateInterval($interval));
    }
}
