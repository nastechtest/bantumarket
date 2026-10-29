<?php

declare(strict_types=1);

namespace NasTech\Notifications;

/**
 * Refuses a notification payload that carries personal data.
 *
 * The table has no column for a phone number, an email address, a message body
 * or anything from a dispute, and this guard keeps the same promise on the way
 * in. A producer that passes the outbox payload through unchanged fails loudly
 * here rather than having a contact detail copied into a log, an export and
 * every retry.
 *
 * Only opaque references and the event timestamp are accepted. The check is
 * intentionally conservative: notification producers should hand over ids, not
 * content.
 */
final class PersonalDataGuard
{
    /** Keys that name content this module must never retain. */
    private const FORBIDDEN_KEYS = [
        'address',
        'body',
        'case_details',
        'content',
        'dispute',
        'dispute_body',
        'email',
        'email_address',
        'message',
        'message_body',
        'mobile',
        'phone',
        'phone_number',
        'street_address',
        'text',
    ];

    private const ALLOWED_NON_ID_KEYS = ['kind', 'occurred_at'];

    private const EMAIL_PATTERN = '/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/';

    /** South African landline/mobile shapes, with or without spacing. */
    private const PHONE_PATTERN = '/(?:\+27|0)[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{4}/';

    /**
     * @param array<string,mixed> $context
     */
    public static function assertSafe(array $context): void
    {
        foreach ($context as $key => $value) {
            $normalised = strtolower((string) $key);

            if (in_array($normalised, self::FORBIDDEN_KEYS, true)) {
                throw new NotificationRefused(sprintf(
                    'Notification payload carries personal data in "%s"; only an opaque account reference and a subject id may be retained',
                    (string) $key,
                ));
            }

            if (!str_ends_with($normalised, '_id') && !in_array($normalised, self::ALLOWED_NON_ID_KEYS, true)) {
                throw new NotificationRefused(sprintf(
                    'Notification payload key "%s" is not an opaque reference',
                    (string) $key,
                ));
            }

            self::assertValueIsOpaque($value, (string) $key);
        }
    }

    private static function assertValueIsOpaque(mixed $value, string $key): void
    {
        if (is_array($value)) {
            foreach ($value as $nestedKey => $nested) {
                self::assertValueIsOpaque($nested, $key . '.' . (string) $nestedKey);
            }

            return;
        }

        if (!is_string($value)) {
            return;
        }

        if (preg_match(self::EMAIL_PATTERN, $value) === 1) {
            throw new NotificationRefused(sprintf(
                'Notification payload "%s" contains an email address; only an opaque reference is retained',
                $key,
            ));
        }
        if (preg_match(self::PHONE_PATTERN, $value) === 1) {
            throw new NotificationRefused(sprintf(
                'Notification payload "%s" contains a phone number; only an opaque reference is retained',
                $key,
            ));
        }
    }
}
