<?php

declare(strict_types=1);

namespace NasTech\Safety;

final class SanctionNotFound extends \RuntimeException
{
    public static function withId(string $sanctionId): self
    {
        return new self("No sanction {$sanctionId} exists");
    }
}
