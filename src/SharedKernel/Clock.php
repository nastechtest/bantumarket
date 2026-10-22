<?php

declare(strict_types=1);

namespace NasTech\SharedKernel;

/**
 * Time comes in through an interface so every test can freeze it and no
 * expiring token, settlement window or CPA dispute period depends on the
 * machine clock.
 */
interface Clock
{
    public function now(): \DateTimeImmutable;
}
