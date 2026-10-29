<?php

declare(strict_types=1);

namespace NasTech\Payouts;

use NasTech\SharedKernel\Money;

/**
 * What a staff member asks a batch to pay, before anything is stored.
 *
 * The brand and last four are raw strings on purpose: the refusal for a full
 * account number has to happen inside the module that owns the rule, not in an
 * HTTP validator that a second caller can forget. `oldestPayableAt` is carried
 * because Reporting measures payout latency from it, and recomputing it later
 * would mean reading Settlements' ledger from the reporting side.
 */
final class PayoutLineRequest
{
    public function __construct(
        public readonly string $sellerId,
        public readonly string $orderId,
        public readonly Money $amount,
        public readonly string $bankBrand,
        public readonly string $bankLastFour,
        public readonly \DateTimeImmutable $oldestPayableAt,
    ) {
        if ($sellerId === '' || $orderId === '') {
            throw new \InvalidArgumentException('A payout request names the seller and the order being paid');
        }
    }
}
