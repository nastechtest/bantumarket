<?php

declare(strict_types=1);

namespace NasTech\Notifications;

/**
 * The outcome of one delivery attempt. Append-only: a failed attempt is
 * answered by attempt two, never edited into SENT after the fact.
 */
enum DeliveryStatus: string
{
    case QUEUED = 'QUEUED';
    case SENT = 'SENT';
    case FAILED = 'FAILED';
    case SUPPRESSED = 'SUPPRESSED';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $status): string => $status->value, self::cases());
    }

    public static function parse(string $value): self
    {
        foreach (self::cases() as $case) {
            if ($case->value === $value) {
                return $case;
            }
        }

        throw new NotificationRefused(sprintf(
            'Unknown delivery status "%s"; the vocabulary is %s',
            $value,
            implode(', ', self::values()),
        ));
    }
}
