<?php

declare(strict_types=1);

namespace NasTech\Settlements;

/**
 * Raised when a transaction would move money without leaving a ledger record.
 * Committing is refused; the caller sees a rollback, not an inconsistency.
 */
final class LedgerIntegrityViolation extends \DomainException
{
}
