<?php

declare(strict_types=1);

namespace NasTech\Settlements;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * The append-only money ledger.
 *
 * Every amount the platform owes or claims is a row here, written in the same
 * transaction as the state change that caused it. Nothing is recomputed from
 * current prices, because prices change and the ledger may not.
 *
 * Invariants this class is responsible for:
 *  - ledger_entries is append-only: update() and delete() throw
 *  - a reversal is a new contra row, never an edit of the original
 *  - a payout can never exceed the ledger-derived balance
 *  - every money-bearing transition registers against the transaction guard,
 *    so a handler that forgets the ledger gets a rollback instead of a hole
 */
final class Ledger
{
    public const TABLE = 'ledger_entries';

    public const TYPE_SELLER_EARNINGS = 'SELLER_EARNINGS';
    public const TYPE_COMMISSION = 'COMMISSION';
    public const TYPE_COMMISSION_REVERSAL = 'COMMISSION_REVERSAL';
    public const TYPE_REFUND = 'REFUND';
    public const TYPE_PAYOUT = 'PAYOUT';
    public const TYPE_CHARGEBACK = 'CHARGEBACK';
    public const TYPE_HOLD = 'HOLD';
    public const TYPE_HOLD_RELEASE = 'HOLD_RELEASE';

    private const DEBIT_TYPES = [
        self::TYPE_COMMISSION,
        self::TYPE_REFUND,
        self::TYPE_PAYOUT,
        self::TYPE_CHARGEBACK,
        self::TYPE_HOLD,
    ];

    private const CREDIT_TYPES = [
        self::TYPE_SELLER_EARNINGS,
        self::TYPE_COMMISSION_REVERSAL,
        self::TYPE_HOLD_RELEASE,
    ];

    /** The two types that bracket an amount as not-yet-payable. */
    private const HOLD_TYPES = [self::TYPE_HOLD, self::TYPE_HOLD_RELEASE];

    public function __construct(
        private readonly Store $store,
        private readonly UnitOfWork $uow,
        private readonly Clock $clock,
    ) {
    }

    /**
     * @param array<string,mixed> $context
     */
    public function record(
        string $sellerId,
        ?string $orderId,
        string $type,
        Money $amount,
        string $reason,
        ?string $reversalOf = null,
    ): LedgerEntry {
        if (!in_array($type, array_merge(self::DEBIT_TYPES, self::CREDIT_TYPES), true)) {
            throw new \InvalidArgumentException("Unknown ledger entry type: {$type}");
        }
        if (!$this->uow->inTransaction()) {
            throw new \LogicException(
                'Ledger entries must be written inside the transaction that changes order state. '
                . 'Writing the ledger outside it is the dual-write this design exists to prevent.'
            );
        }
        if ($amount->isZero()) {
            throw new \InvalidArgumentException('A zero-value ledger entry is noise, not evidence');
        }
        if ($reversalOf !== null && $this->store->find(self::TABLE, $reversalOf) === null) {
            throw new \RuntimeException("Reversal references a ledger entry that does not exist: {$reversalOf}");
        }
        if ($reversalOf === null && in_array($type, [self::TYPE_COMMISSION_REVERSAL], true)) {
            throw new \LogicException("{$type} must reference the entry it reverses");
        }

        $signed = in_array($type, self::DEBIT_TYPES, true)
            ? ($amount->isNegative() ? $amount : $amount->negate())
            : ($amount->isPositive() ? $amount : $amount->negate());

        $entry = new LedgerEntry(
            id: Id::generate('led'),
            sellerId: $sellerId,
            orderId: $orderId,
            type: $type,
            amount: $signed,
            reason: $reason,
            recordedAt: $this->clock->now(),
            reversalOf: $reversalOf,
        );

        $this->store->insert(self::TABLE, $entry->toArray());

        return $entry;
    }

    /**
     * Balance is derived from rows, never stored, so it cannot drift from them.
     */
    public function sellerBalance(string $sellerId): Money
    {
        $total = Money::zero();
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['seller_id'] !== $sellerId) {
                continue;
            }
            $total = $total->add(Money::fromCents((int) $row['amount_cents']));
        }

        return $total;
    }

    /**
     * @return list<array<string,mixed>>
     */
    public function entriesForOrder(string $orderId): array
    {
        return array_values(array_filter(
            $this->store->all(self::TABLE),
            static fn (array $row): bool => (string) ($row['order_id'] ?? '') === $orderId,
        ));
    }

    /**
     * @return list<array<string,mixed>>
     */
    public function entriesForSeller(string $sellerId): array
    {
        return array_values(array_filter(
            $this->store->all(self::TABLE),
            static fn (array $row): bool => (string) $row['seller_id'] === $sellerId,
        ));
    }

    /**
     * How much of an order's money is still held back from the payable balance.
     * Zero once the hold has been released, so a refund can release exactly what
     * is outstanding and never more.
     */
    public function unreleasedHold(string $orderId): Money
    {
        $net = Money::zero();
        foreach ($this->entriesForOrder($orderId) as $row) {
            if (!in_array((string) $row['entry_type'], self::HOLD_TYPES, true)) {
                continue;
            }
            $net = $net->add(Money::fromCents((int) $row['amount_cents'], (string) $row['currency']));
        }

        return $net->isNegative() ? $net->negate() : Money::zero();
    }

    /**
     * Commission actually borne by this order after reversals — the number a
     * settlement file has to agree with.
     */
    public function netCommissionForOrder(string $orderId): Money
    {
        $net = Money::zero();
        foreach ($this->entriesForOrder($orderId) as $row) {
            if (!in_array((string) $row['entry_type'], [self::TYPE_COMMISSION, self::TYPE_COMMISSION_REVERSAL], true)) {
                continue;
            }
            // Stored signed: commission is a debit (negative to the seller), so the
            // platform's take is its negation.
            $net = $net->add(Money::fromCents((int) $row['amount_cents'], (string) $row['currency'])->negate());
        }

        return $net;
    }

    public function entry(?string $id): ?LedgerEntry
    {
        $row = $this->store->find(self::TABLE, (string) $id);

        return $row === null ? null : LedgerEntry::fromRow($row);
    }

    /**
     * The commission row a refund must reverse. Returns null when an order was
     * sold commission-free, which is a legitimate state, so the caller decides
     * whether a missing row means "no commission" or "ledger and evidence agree
     * there was none".
     *
     * @return list<array<string,mixed>>
     */
    public function commissionEntriesForOrder(string $orderId): array
    {
        return array_values(array_filter(
            $this->entriesForOrder($orderId),
            static fn (array $row): bool => (string) $row['entry_type'] === self::TYPE_COMMISSION,
        ));
    }

    /**
     * Every order the ledger has a row for. Seller-level rows such as payouts
     * carry no order and are not reported here.
     *
     * @return list<string>
     */
    public function orderIds(): array
    {
        $ids = [];
        foreach ($this->store->all(self::TABLE) as $row) {
            if ($row['order_id'] === null) {
                continue;
            }
            $ids[(string) $row['order_id']] = true;
        }
        $ordered = array_keys($ids);
        sort($ordered);

        return $ordered;
    }

    public function count(): int
    {
        return count($this->store->all(self::TABLE));
    }
}
