<?php

declare(strict_types=1);

namespace NasTech\Settlements;

use NasTech\Orders\Order;
use NasTech\Orders\OrderRepository;
use NasTech\SharedKernel\Money;

/**
 * Reconcile a provider settlement file against the ledger.
 *
 * This is the check that catches the class of error no transaction guard can: a
 * payment that was recorded in a way the ledger and the provider both find
 * internally consistent but mutually wrong. Running it daily is how that becomes
 * a support ticket rather than a discovered-at-scale shortfall.
 *
 * Two directions matter. A file line with no ledger row means money moved that we
 * did not book. A ledger row with no file line means we booked money that did not
 * move — which is a seller balance we cannot pay.
 */
final class ReconcileSettlementFile
{
    public function __construct(
        private readonly Ledger $ledger,
        private readonly OrderRepository $orders,
    ) {
    }

    /**
     * @param list<SettlementLine> $lines
     */
    public function reconcile(array $lines): ReconciliationReport
    {
        $discrepancies = [];

        // Lines are aggregated per order rather than checked one by one, and the
        // reason is money: a refund is a second line for the same order, and so is a
        // provider that settles a sale twice. Checking each line against the ledger
        // separately passes both — the duplicate looks like the original. Summed per
        // order, a double settlement is a gross the ledger never earned.
        $file = $this->aggregate($lines);

        foreach ($file as $orderId => $totals) {
            $entries = $this->ledger->entriesForOrder($orderId);
            if ($entries === []) {
                $discrepancies[] = [
                    'kind' => 'unbooked_settlement',
                    'order_id' => $orderId,
                    'observed' => $totals['net']->toRandString(),
                    'expected' => 'a ledger for this order',
                ];

                continue;
            }

            $earnings = Money::zero();
            foreach ($entries as $row) {
                if (in_array((string) $row['entry_type'], [Ledger::TYPE_SELLER_EARNINGS, Ledger::TYPE_REFUND], true)) {
                    $earnings = $earnings->add(Money::fromCents((int) $row['amount_cents'], (string) $row['currency']));
                }
            }
            if (!$earnings->equals($totals['gross'])) {
                $discrepancies[] = [
                    'kind' => 'gross_mismatch',
                    'order_id' => $orderId,
                    'observed' => $totals['gross']->toRandString(),
                    'expected' => $earnings->toRandString(),
                ];
            }

            $take = $this->ledger->netCommissionForOrder($orderId);
            if (!$take->equals($totals['take'])) {
                $discrepancies[] = [
                    'kind' => 'commission_mismatch',
                    'order_id' => $orderId,
                    'observed' => $totals['take']->toRandString(),
                    'expected' => $take->toRandString(),
                ];
            }

            if (!$totals['net']->isZero()) {
                $order = $this->orders->find($orderId);
                if ($order !== null && $order->status !== Order::COMPLETED && $order->status !== Order::REFUNDED) {
                    $discrepancies[] = [
                        'kind' => 'settled_before_completion',
                        'order_id' => $orderId,
                        'observed' => $totals['net']->toRandString(),
                        'expected' => 'zero, because the order is ' . $order->status,
                    ];
                }
            }
        }

        $payableOrderIds = $this->payableLedgerOrderIds();
        foreach ($payableOrderIds as $orderId) {
            if (!isset($file[$orderId])) {
                $discrepancies[] = [
                    'kind' => 'unsettled_ledger',
                    'order_id' => $orderId,
                    'observed' => 'absent from the settlement file',
                    'expected' => 'a line for this order',
                ];
            }
        }

        return new ReconciliationReport($discrepancies, count($lines), count($payableOrderIds));
    }

    /**
     * @param list<SettlementLine> $lines
     * @return array<string, array{gross:Money, take:Money, net:Money}>
     */
    private function aggregate(array $lines): array
    {
        $byOrder = [];
        foreach ($lines as $line) {
            $totals = $byOrder[$line->orderId] ?? [
                'gross' => Money::zero(),
                'take' => Money::zero(),
                'net' => Money::zero(),
            ];
            $byOrder[$line->orderId] = [
                'gross' => $totals['gross']->add($line->gross),
                'take' => $totals['take']->add($line->platformTake),
                'net' => $totals['net']->add($line->netToSeller),
            ];
        }

        return $byOrder;
    }

    /**
     * Orders whose money has become payable — earnings recorded, hold released,
     * not subsequently refunded. Only these are owed a line in the file; flagging
     * a paid-but-unfinished order as unsettled would be noise, not a finding.
     *
     * @return list<string>
     */
    private function payableLedgerOrderIds(): array
    {
        $payable = [];
        foreach ($this->ledger->orderIds() as $orderId) {
            $earned = false;
            $refunded = false;
            foreach ($this->ledger->entriesForOrder($orderId) as $row) {
                $earned = $earned || (string) $row['entry_type'] === Ledger::TYPE_SELLER_EARNINGS;
                $refunded = $refunded || (string) $row['entry_type'] === Ledger::TYPE_REFUND;
            }
            if (!$earned || $refunded) {
                continue;
            }
            if (!$this->ledger->unreleasedHold($orderId)->isZero()) {
                continue;
            }
            $payable[] = $orderId;
        }

        return $payable;
    }
}
