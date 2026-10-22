<?php

declare(strict_types=1);

namespace NasTech\SharedKernel;

final class SystemClock implements Clock
{
    public function now(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now');
    }
}
