<?php

declare(strict_types=1);

namespace NasTech\Settlements;

use NasTech\Commissions\CommissionEntry;
use NasTech\Orders\Order;
use NasTech\Orders\OrderRepository;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * The money invariants, enforced by the transaction rather than by the handler.
 *
 * A commit-time guard that a handler registers can only detect that the handler
 * forgot the thing the handler also does. It cannot detect the omission. This
 * class is installed once, on the unit of work, and reads the tables the way a
 * PostgreSQL constraint or trigger would: whatever wrote the rows, the invariant
 * either holds at commit or the commit fails.
 *
 * The five checks are the five cluster_warning items from
 * 03-nastech-market.modules.dot.
 */
final class MoneyInvariants
{
    /** States that are only reachable after money has moved. */
    private const POST_PAYMENT_STATES = [
        Order::PAID,
        Order::HANDOVER_SCHEDULED,
        Order::HANDOVER_CONFIRMED,
        Order::COMPLETED,
        Order::REFUND_PENDING,
        Order::REFUNDED,
        Order::IN_DISPUTE,
        Order::CANCELLED,
    ];

    /** States from which no money may still be held back. */
    private const SETTLED_STATES = [
        Order::COMPLETED,
        Order::REFUNDED,
        Order::CANCELLED,
    ];

    public function __construct(private readonly Store $store)
    {
    }

    /**
     * Install these checks on a unit of work so that every commit is measured
     * against them.
     */
    public static function install(UnitOfWork $uow, Store $store): void
    {
        $invariants = new self($store);
        $uow->setInvariantChecker(static function () use ($invariants): void {
            $invariants->check();
        });
    }

    public function check(): void
    {
        $ledgerByOrder = $this->indexLedgerByOrder();
        $evidencedOrders = $this->ordersWithCommissionEvidence();

        foreach ($this->store->all(OrderRepository::TABLE) as $orderRow) {
            $orderId = (string) $orderRow['id'];
            $status = (string) $orderRow['status'];
            $entries = $ledgerByOrder[$orderId] ?? [];

            if (in_array($status, self::POST_PAYMENT_STATES, true) && $entries === []) {
                throw new LedgerIntegrityViolation(sprintf(
                    'Order %s is %s with no ledger row at all. A paid order without a money record '
                    . 'cannot be reconciled, refunded or defended after the fact.',
                    $orderId,
                    $status,
                ));
            }

            if (isset($entries[Ledger::TYPE_SELLER_EARNINGS]) && !isset($evidencedOrders[$orderId])) {
                throw new LedgerIntegrityViolation(sprintf(
                    'Order %s credited %s of seller earnings with no commission evidence row. '
                    . 'The ledger says what was taken; nothing says why.',
                    $orderId,
                    Money::fromCents((int) $entries[Ledger::TYPE_SELLER_EARNINGS], (string) $orderRow['currency'])->toRandString(),
                ));
            }

            if (isset($entries[Ledger::TYPE_REFUND]) && $this->netCents($entries, [
                Ledger::TYPE_COMMISSION,
                Ledger::TYPE_COMMISSION_REVERSAL,
            ]) !== 0) {
                throw new LedgerIntegrityViolation(sprintf(
                    'Order %s was refunded but still carries net commission of %s. Commission is '
                    . 'charged on completed sales; this one did not complete.',
                    $orderId,
                    Money::fromCents(
                        -$this->netCents($entries, [Ledger::TYPE_COMMISSION, Ledger::TYPE_COMMISSION_REVERSAL]),
                        (string) $orderRow['currency'],
                    )->toRandString(),
                ));
            }

            if (in_array($status, self::SETTLED_STATES, true) && $entries !== []
                && $this->netCents($entries, [Ledger::TYPE_HOLD, Ledger::TYPE_HOLD_RELEASE]) !== 0) {
                throw new LedgerIntegrityViolation(sprintf(
                    'Order %s is %s with %s still held. Money stuck in a hold on a closed order is '
                    . 'the seller complaint that arrives two weeks after launch.',
                    $orderId,
                    $status,
                    Money::fromCents(
                        abs($this->netCents($entries, [Ledger::TYPE_HOLD, Ledger::TYPE_HOLD_RELEASE])),
                        (string) $orderRow['currency'],
                    )->toRandString(),
                ));
            }
        }

        $this->checkNoBalanceIsOverdrawn();
    }

    /**
     * @return array<string, array<string,int>> order id => entry type => signed cents summed
     */
    private function indexLedgerByOrder(): array
    {
        $index = [];
        foreach ($this->store->all(Ledger::TABLE) as $row) {
            if ($row['order_id'] === null) {
                continue;
            }
            $orderId = (string) $row['order_id'];
            $type = (string) $row['entry_type'];
            $index[$orderId][$type] = ($index[$orderId][$type] ?? 0) + (int) $row['amount_cents'];
        }

        return $index;
    }

    /**
     * @return array<string,true>
     */
    private function ordersWithCommissionEvidence(): array
    {
        $present = [];
        foreach ($this->store->all(CommissionEntry::TABLE) as $row) {
            if ((string) $row['kind'] === CommissionEntry::KIND_FORWARD) {
                $present[(string) $row['order_id']] = true;
            }
        }

        return $present;
    }

    /**
     * @param array<string,int> $entries
     * @param list<string> $types
     */
    private function netCents(array $entries, array $types): int
    {
        $net = 0;
        foreach ($types as $type) {
            $net += $entries[$type] ?? 0;
        }

        return $net;
    }

    private function checkNoBalanceIsOverdrawn(): void
    {
        $balances = [];
        foreach ($this->store->all(Ledger::TABLE) as $row) {
            $seller = (string) $row['seller_id'];
            $balances[$seller] = ($balances[$seller] ?? 0) + (int) $row['amount_cents'];
        }

        foreach ($balances as $seller => $cents) {
            if ($cents >= 0) {
                continue;
            }
            throw new LedgerIntegrityViolation(sprintf(
                'Seller %s would be left at %s after this transaction. The platform may owe a seller '
                . 'money or hold a chargeback against them, but it may not commit a balance that '
                . 'implies the seller owes the marketplace on a sale they made.',
                $seller,
                Money::fromCents($cents)->toRandString(),
            ));
        }
    }
}
