<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * The report's own lifecycle. Kept as data because the DDL enumeration and the
 * triage console bind to the same strings; a state invented in the UI is the
 * row the CHECK refuses at insert.
 */
final class ReportState
{
    public const OPEN = 'OPEN';
    public const UNDER_REVIEW = 'UNDER_REVIEW';
    public const RESOLVED = 'RESOLVED';
    public const DISMISSED = 'DISMISSED';

    /** @var list<string> */
    public const ALL = [self::OPEN, self::UNDER_REVIEW, self::RESOLVED, self::DISMISSED];

    public static function isValid(string $state): bool
    {
        return in_array($state, self::ALL, true);
    }

    private function __construct()
    {
    }
}
