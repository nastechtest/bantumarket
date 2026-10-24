<?php

declare(strict_types=1);

namespace NasTech\Commissions;

use NasTech\SharedKernel\Money;

/**
 * Pricing evidence for one sale.
 *
 * Not the money record — the ledger is. This row exists because a commission
 * dispute is answered with "here is the gross, the policy id, the rate and the
 * floor or cap that bound it", and because a policy change must never re-price
 * a sale that already happened. Written even when the commission is zero, since
 * "we charged nothing, deliberately, under policy X" is evidence too.
 */
final class CommissionEntry
{
    public const TABLE = 'commission_entries';

    public const KIND_FORWARD = 'FORWARD';
    public const KIND_REVERSAL = 'REVERSAL';

    public function __construct(
        public readonly string $id,
        public readonly string $orderId,
        public readonly string $sellerId,
        public readonly string $category,
        public readonly string $policyId,
        public readonly float $rate,
        public readonly Money $gross,
        public readonly Money $commission,
        public readonly Money $sellerNet,
        public readonly ?string $ledgerEntryId,
        public readonly \DateTimeImmutable $calculatedAt,
        public readonly ?string $reversalOf = null,
        public readonly string $kind = self::KIND_FORWARD,
    ) {
        // The three amount columns have to add up, because this row is what a
        // seller is shown when they query a charge. A handler that computes gross,
        // commission and net independently is one variable away from a number that
        // cannot be defended. FORWARD only: a reversal copies the forward gross and
        // net and negates the commission, so its own subtraction is not expected to
        // close. Mirrored by forward_net_is_gross_less_commission in the DDL.
        if ($kind === self::KIND_FORWARD && !$this->gross->subtract($this->commission)->equals($this->sellerNet)) {
            throw new CommissionIntegrityViolation(sprintf(
                'Commission entry %s does not add up: gross %s less commission %s is not the stored net %s',
                $this->id,
                $this->gross->toRandString(),
                $this->commission->toRandString(),
                $this->sellerNet->toRandString(),
            ));
        }

        // One rule, both sides: the platform never books a negative cut, and a
        // reversal never books a positive one. Mirrors commission_sign_follows_kind.
        if ($kind === self::KIND_FORWARD && $this->commission->isNegative()) {
            throw new CommissionIntegrityViolation(sprintf(
                'Order %s has a negative forward commission of %s',
                $this->orderId,
                $this->commission->toRandString(),
            ));
        }
        if ($kind === self::KIND_REVERSAL && !$this->commission->isNegative()) {
            throw new CommissionIntegrityViolation(sprintf(
                'Order %s reverses a commission of %s, which returns money rather than taking it back',
                $this->orderId,
                $this->commission->toRandString(),
            ));
        }

        // The shape of the pointer is the shape of the row: a forward entry with a
        // parent and a reversal without one are both rows nobody can explain.
        if ($kind === self::KIND_FORWARD && $this->reversalOf !== null) {
            throw new CommissionIntegrityViolation("Forward commission entry {$this->id} cannot reverse an entry");
        }
        if ($kind === self::KIND_REVERSAL && $this->reversalOf === null) {
            throw new CommissionIntegrityViolation(
                "Reversal commission entry {$this->id} must name the entry it reverses"
            );
        }

        // A commission the seller actually paid is money the ledger moved; the
        // evidence row has to point at it. Zero is the promo case: evidence, no money.
        if (!$this->commission->isZero() && $this->ledgerEntryId === null) {
            throw new CommissionIntegrityViolation(sprintf(
                'Commission entry %s charges %s with no ledger entry behind it',
                $this->id,
                $this->commission->toRandString(),
            ));
        }
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'order_id' => $this->orderId,
            'seller_id' => $this->sellerId,
            'category' => $this->category,
            'policy_id' => $this->policyId,
            'rate' => $this->rate,
            'gross_cents' => $this->gross->cents,
            'commission_cents' => $this->commission->cents,
            'seller_net_cents' => $this->sellerNet->cents,
            'currency' => $this->gross->currency,
            'ledger_entry_id' => $this->ledgerEntryId,
            'calculated_at' => $this->calculatedAt->format(\DateTimeInterface::ATOM),
            'reversal_of' => $this->reversalOf,
            'kind' => $this->kind,
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            orderId: (string) $row['order_id'],
            sellerId: (string) $row['seller_id'],
            category: (string) $row['category'],
            policyId: (string) $row['policy_id'],
            rate: (float) $row['rate'],
            gross: Money::fromCents((int) $row['gross_cents'], (string) $row['currency']),
            commission: Money::fromCents((int) $row['commission_cents'], (string) $row['currency']),
            sellerNet: Money::fromCents((int) $row['seller_net_cents'], (string) $row['currency']),
            ledgerEntryId: $row['ledger_entry_id'] === null ? null : (string) $row['ledger_entry_id'],
            calculatedAt: new \DateTimeImmutable((string) $row['calculated_at']),
            reversalOf: $row['reversal_of'] === null ? null : (string) $row['reversal_of'],
            kind: (string) ($row['kind'] ?? self::KIND_FORWARD),
        );
    }
}
