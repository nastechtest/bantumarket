<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * A thread has exactly two states. CLOSED does not mean hidden: both parties and
 * an audit read can still fetch it, because the conversation is the record of what
 * was said before a handover or a dispute. It means no new message may be sent.
 */
enum ThreadStatus: string
{
    case OPEN = 'OPEN';
    case CLOSED = 'CLOSED';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $status): string => $status->value, self::cases());
    }
}
