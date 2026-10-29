<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * The screen a free-text report body must pass before it is stored.
 *
 * Safety stores the body, because a reviewer cannot act on a report that says
 * "something bad happened" and nothing else. That is exactly why the body is
 * the most dangerous column in the module: a phone number, an ID number, a
 * card number, a street address or a survivor detail written into it is
 * personal data retained without a lawful basis and, in the case of survivor
 * detail, data whose discovery in a leaked table is itself a second harm.
 *
 * The screen refuses rather than redacts. Redaction silently changes what the
 * reporter said; a refusal tells them what to remove and leaves the record
 * honest. Detection is deliberately conservative (a long digit run, a South
 * African phone shape, a numbered street line, a short survivor vocabulary):
 * that catches the shapes the DDL also refuses, and leaves ordinary prose
 * alone. It is not a classifier and is not presented as one.
 */
final class PersonalDataScreen
{
    public const MAX_BODY_BYTES = 4000;

    /** A street line: a number, up to three words, and a street suffix. */
    private const STREET_ADDRESS = '/\b\d{1,5}\s+[A-Za-z][A-Za-z\'.-]*(?:\s+[A-Za-z][A-Za-z\'.-]*){0,3}\s+'
        . '(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|close|crescent|cres|boulevard|blvd|way|court|ct|place|pl)\b/i';

    /** South African mobile/local shape: +27, 0027, 27 or 0 followed by 9 digits. */
    private const PHONE_NUMBER = '/(^|[^0-9])(?:\+?27|0027|0)[ -]?[0-9]{2}[ -]?[0-9]{3}[ -]?[0-9]{4}([^0-9]|$)/';

    /** Words that turn a report into a record of a survivor's experience. */
    private const SURVIVOR_DETAIL = '/\b(?:rape|raped|raping|sexual assault|sexually assaulted|'
        . 'molest(?:ed|ation)?|incest|trafficked|survivor)\b/i';

    /**
     * @throws PersonalDataRefused
     */
    public static function assertClean(string $body): void
    {
        $trimmed = trim($body);
        if ($trimmed === '') {
            throw new SafetyRuleViolation('A report body is required; a report that says nothing cannot be triaged');
        }
        if (strlen($trimmed) > self::MAX_BODY_BYTES) {
            throw new SafetyRuleViolation(sprintf(
                'A report body is limited to %d bytes; attach the detail through the controlled evidence path instead',
                self::MAX_BODY_BYTES,
            ));
        }

        if (preg_match(self::SURVIVOR_DETAIL, $trimmed) === 1) {
            throw new PersonalDataRefused(PersonalDataRefused::SURVIVOR_DETAIL);
        }
        if (preg_match(self::STREET_ADDRESS, $trimmed) === 1) {
            throw new PersonalDataRefused(PersonalDataRefused::STREET_ADDRESS);
        }

        // Long digit runs are identity or card numbers. The separator makes
        // '900101 5800 087' and '4111 1111 1111 1111' one class of finding.
        if (preg_match_all('/[0-9](?:[ -]?[0-9]){11,}/', $trimmed, $runs) > 0) {
            foreach ($runs[0] as $run) {
                $digits = preg_replace('/[^0-9]/', '', $run) ?? '';
                $length = strlen($digits);
                if ($length === 13) {
                    throw new PersonalDataRefused(PersonalDataRefused::ID_NUMBER);
                }
                if ($length >= 14 && $length <= 19) {
                    throw new PersonalDataRefused(PersonalDataRefused::CARD_NUMBER);
                }
            }
        }

        if (preg_match(self::PHONE_NUMBER, $trimmed) === 1) {
            throw new PersonalDataRefused(PersonalDataRefused::PHONE_NUMBER);
        }
    }

    private function __construct()
    {
    }
}
