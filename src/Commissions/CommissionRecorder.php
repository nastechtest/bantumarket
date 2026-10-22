<?php

declare(strict_types=1);

namespace NasTech\Commissions;

use NasTech\Settlements\Ledger;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Turns a resolved policy into two writes that must commit together: the money
 * row in the ledger and the pricing-evidence row.
 *
 * The failure mode this closes is the one named in the module graph — an order
 * marked paid with no commission record, or a refund that reverses the buyer's
 * payment while leaving the platform's commission charged. Both are commit-time
 * guards here, so they roll back instead of being discovered in reconciliation.
 */
final class CommissionRecorder
{
    public function __construct(
        private readonly Store $store,
        private readonly Ledger $ledger,
        private readonly CommissionPolicyRegistry $policies,
        private readonly Clock $clock,
    ) {
    }

    public function charge(CommissionableSale $sale): CommissionEntry
    {
        $at = $this->clock->now();
        $gross = $sale->gross;
        $policy = $this->policies->resolve($sale->category, $at);
        $commission = $policy->commissionOn($gross);
        $net = $gross->subtract($commission);
        if ($net->isNegative()) {
            throw new CommissionIntegrityViolation(sprintf(
                'Policy %s would take %s from a sale of %s, leaving the seller negative. '
                    . 'A commission floor above the item price is a misconfiguration, not a charge.',
                $policy->id,
                $commission->toRandString(),
                $gross->toRandString(),
            ));
        }

        $ledgerEntry = $commission->isZero()
            ? null
            : $this->ledger->record(
                $sale->sellerId,
                $sale->orderId,
                Ledger::TYPE_COMMISSION,
                $commission,
                sprintf('Commission %s%% under policy %s', rtrim(rtrim(number_format($policy->rate * 100, 4, '.', ''), '0'), '.'), $policy->id),
            );

        $entry = new CommissionEntry(
            id: Id::generate('cme')->value(),
            orderId: $sale->orderId,
            sellerId: $sale->sellerId,
            category: $sale->category,
            policyId: $policy->id,
            rate: $policy->rate,
            gross: $gross,
            commission: $commission,
            sellerNet: $net,
            ledgerEntryId: $ledgerEntry?->id->value(),
            calculatedAt: $at,
        );

        $this->store->insert(CommissionEntry::TABLE, $entry->toArray());

        return $entry;
    }

    /**
     * Reverse the commission for a refunded order. Called by the refund handler
     * in the same transaction that writes the REFUND ledger row.
     *
     * @return list<CommissionEntry>
     */
    public function reverseForRefund(CommissionableSale $sale, string $reason): array
    {
        $forward = $this->forwardEntryFor($sale->orderId);
        if ($forward === null || $forward->commission->isZero()) {
            return [];
        }
        if ($this->reversalOf($forward->id) !== null) {
            return [];
        }

        $ledgerReversal = $this->ledger->record(
            $sale->sellerId,
            $sale->orderId,
            Ledger::TYPE_COMMISSION_REVERSAL,
            $forward->commission,
            $reason,
            $forward->ledgerEntryId,
        );

        $reversal = new CommissionEntry(
            id: Id::generate('cme')->value(),
            orderId: $sale->orderId,
            sellerId: $sale->sellerId,
            category: $forward->category,
            policyId: $forward->policyId,
            rate: $forward->rate,
            gross: $forward->gross,
            commission: $forward->commission->negate(),
            sellerNet: $forward->sellerNet,
            ledgerEntryId: $ledgerReversal->id->value(),
            calculatedAt: $this->clock->now(),
            reversalOf: $forward->id,
            kind: CommissionEntry::KIND_REVERSAL,
        );

        $this->store->insert(CommissionEntry::TABLE, $reversal->toArray());

        return [$reversal];
    }

    public function forwardEntryFor(string $orderId): ?CommissionEntry
    {
        foreach ($this->store->all(CommissionEntry::TABLE) as $row) {
            if ((string) $row['order_id'] === $orderId && (string) $row['kind'] === CommissionEntry::KIND_FORWARD) {
                return CommissionEntry::fromRow($row);
            }
        }

        return null;
    }

    private function reversalOf(string $forwardEntryId): ?CommissionEntry
    {
        foreach ($this->store->all(CommissionEntry::TABLE) as $row) {
            if ((string) ($row['reversal_of'] ?? '') === $forwardEntryId
                && (string) $row['kind'] === CommissionEntry::KIND_REVERSAL) {
                return CommissionEntry::fromRow($row);
            }
        }

        return null;
    }
}
