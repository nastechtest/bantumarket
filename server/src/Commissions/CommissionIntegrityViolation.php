<?php

declare(strict_types=1);

namespace NasTech\Commissions;

/**
 * Raised when a transaction changed order state without the commission record
 * that makes the ledger amount explainable.
 */
final class CommissionIntegrityViolation extends \DomainException
{
}
