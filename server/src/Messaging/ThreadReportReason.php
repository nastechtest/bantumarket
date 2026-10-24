<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * Why a participant reported a thread. This is the vocabulary the human queue
 * filters on; `OTHER` still requires details so the queue is not a dead end.
 */
enum ThreadReportReason: string
{
    case HARASSMENT = 'HARASSMENT';
    case SCAM = 'SCAM';
    case SPAM = 'SPAM';
    case OFF_PLATFORM_PRESSURE = 'OFF_PLATFORM_PRESSURE';
    case OTHER = 'OTHER';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $reason): string => $reason->value, self::cases());
    }
}
