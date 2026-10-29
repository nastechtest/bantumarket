<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * The account actions Safety may take.
 *
 * Warning is single-actor. Suspend and ban restrain what a person can do, so
 * they are maker-checker: the account that proposes cannot be the account that
 * applies. The asymmetry is a property of the action, not of the caller.
 */
final class SanctionAction
{
    public const WARNING = 'WARNING';
    public const SUSPEND = 'SUSPEND';
    public const BAN = 'BAN';

    /** @var list<string> */
    public const ALL = [self::WARNING, self::SUSPEND, self::BAN];

    public static function isValid(string $action): bool
    {
        return in_array($action, self::ALL, true);
    }

    public static function requiresSecondActor(string $action): bool
    {
        return $action === self::SUSPEND || $action === self::BAN;
    }

    private function __construct()
    {
    }
}
