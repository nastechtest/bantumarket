<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * The closed reason vocabulary a report may be filed under.
 *
 * The list is deliberately short and categorical. "Other" exists because a
 * marketplace cannot anticipate every harm, but it is not a synonym for
 * "anything": the body still has to be written and screened. A reason a
 * reviewer cannot quote back to a seller is not a reason.
 */
final class ReportReason
{
    public const HARASSMENT = 'HARASSMENT';
    public const SCAM = 'SCAM';
    public const COUNTERFEIT = 'COUNTERFEIT';
    public const PROHIBITED_ITEM = 'PROHIBITED_ITEM';
    public const OFF_PLATFORM = 'OFF_PLATFORM';
    public const PERSONAL_DATA = 'PERSONAL_DATA';
    public const OTHER = 'OTHER';

    /** @var list<string> */
    public const ALL = [
        self::HARASSMENT,
        self::SCAM,
        self::COUNTERFEIT,
        self::PROHIBITED_ITEM,
        self::OFF_PLATFORM,
        self::PERSONAL_DATA,
        self::OTHER,
    ];

    public static function isValid(string $reason): bool
    {
        return in_array($reason, self::ALL, true);
    }

    private function __construct()
    {
    }
}
