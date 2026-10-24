<?php

declare(strict_types=1);

namespace NasTech\SharedKernel\Persistence;

/**
 * A duplicate write against a declared unique index.
 *
 * The point of this exception is that idempotency is enforced by storage, not
 * by remembering to check first. Code that forgets the check still cannot
 * double-post a ledger entry.
 */
final class UniqueConstraintViolation extends \RuntimeException
{
    public function __construct(string $table, string $index, string $value)
    {
        parent::__construct("Unique violation on {$table}.{$index} (value: {$value})");
    }
}
