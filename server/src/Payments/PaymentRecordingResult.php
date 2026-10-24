<?php

declare(strict_types=1);

namespace NasTech\Payments;

use NasTech\Commissions\CommissionEntry;

/**
 * The three honest outcomes of a payment callback. A duplicate is not an error —
 * it is the idempotency working — and a discrepancy is not a failure to hide from
 * the provider, because returning 500 makes it retry forever.
 */
final class PaymentRecordingResult
{
    public const ACCEPTED = 'accepted';
    public const DUPLICATE = 'duplicate';
    public const DISCREPANCY = 'discrepancy';

    private function __construct(
        public readonly string $status,
        public readonly ?CommissionEntry $commission = null,
    ) {
    }

    public static function accepted(CommissionEntry $commission): self
    {
        return new self(self::ACCEPTED, $commission);
    }

    public static function duplicate(): self
    {
        return new self(self::DUPLICATE);
    }

    public static function discrepancy(): self
    {
        return new self(self::DISCREPANCY);
    }
}
