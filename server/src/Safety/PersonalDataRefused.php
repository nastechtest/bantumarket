<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * The body was refused because it contained a category of personal data the
 * platform must not keep in a free-text report.
 *
 * The message names the category and nothing else. Repeating the offending
 * value in the error would put the phone number or ID number into a log, a
 * stack trace and the reporter's screen — the three places the screening
 * exists to keep it out of.
 */
final class PersonalDataRefused extends SafetyRuleViolation
{
    public const PHONE_NUMBER = 'PHONE_NUMBER';
    public const ID_NUMBER = 'ID_NUMBER';
    public const CARD_NUMBER = 'CARD_NUMBER';
    public const STREET_ADDRESS = 'STREET_ADDRESS';
    public const SURVIVOR_DETAIL = 'SURVIVOR_DETAIL';

    public function __construct(public readonly string $category)
    {
        parent::__construct(sprintf(
            'A report body may not contain %s. Describe the conduct and let staff request the '
            . 'identifying detail through the controlled evidence path; this text is stored and '
            . 'must be safe to keep.',
            self::describe($category),
        ));
    }

    private static function describe(string $category): string
    {
        return match ($category) {
            self::PHONE_NUMBER => 'a phone number',
            self::ID_NUMBER => 'an identity number',
            self::CARD_NUMBER => 'a card number',
            self::STREET_ADDRESS => 'a street address',
            self::SURVIVOR_DETAIL => 'survivor detail',
            default => 'personal data',
        };
    }
}
