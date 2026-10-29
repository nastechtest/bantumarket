<?php

declare(strict_types=1);

namespace NasTech\Notifications;

/**
 * Where a delivery was attempted, from a closed vocabulary.
 *
 * A channel is not an address. The phone number, email address or device token
 * belongs to Identity and is resolved at send time; this module records only
 * that an attempt on a channel happened. That is why the table has no address
 * column to leak into a log, an export or a retry.
 */
enum NotificationChannel: string
{
    case IN_APP = 'IN_APP';
    case EMAIL = 'EMAIL';
    case PUSH = 'PUSH';
    case SMS = 'SMS';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $channel): string => $channel->value, self::cases());
    }

    public static function parse(string $value): self
    {
        foreach (self::cases() as $case) {
            if ($case->value === $value) {
                return $case;
            }
        }

        throw new NotificationRefused(sprintf(
            'Unknown delivery channel "%s"; the vocabulary is %s',
            $value,
            implode(', ', self::values()),
        ));
    }
}
