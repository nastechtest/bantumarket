<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * A read cursor was written from a stale view — typically the other of two
 * devices. The cursor is per device precisely so this failure is contained: the
 * losing device re-reads its own state and does not advance anyone else's.
 */
final class StaleReadVersion extends \DomainException
{
    public function __construct(string $threadId, string $deviceId, int $expected, int $actual)
    {
        parent::__construct(sprintf(
            'Read state for thread %s on device %s was at version %d, not the expected %d',
            $threadId,
            $deviceId,
            $actual,
            $expected,
        ));
    }
}
