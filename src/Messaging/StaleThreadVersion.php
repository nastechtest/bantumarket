<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * The thread moved between load and write. The caller re-reads and retries; the
 * sequence number it was about to use is not reused.
 */
final class StaleThreadVersion extends \DomainException
{
    public function __construct(string $threadId, int $expected, int $actual)
    {
        parent::__construct(sprintf(
            'Thread %s was at version %d when loaded but version %d when saved; reload and retry',
            $threadId,
            $expected,
            $actual,
        ));
    }
}
