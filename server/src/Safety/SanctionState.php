<?php

declare(strict_types=1);

namespace NasTech\Safety;

final class SanctionState
{
    public const PROPOSED = 'PROPOSED';
    public const APPLIED = 'APPLIED';

    /** @var list<string> */
    public const ALL = [self::PROPOSED, self::APPLIED];

    public static function isValid(string $state): bool
    {
        return in_array($state, self::ALL, true);
    }

    private function __construct()
    {
    }
}
