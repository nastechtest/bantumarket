<?php

declare(strict_types=1);

namespace NasTech\Settlements;

use NasTech\Commissions\CommissionableSale;
use NasTech\Commissions\CommissionRecorder;
use NasTech\Orders\Order;
use NasTech\Orders\OrderRepository;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * The provider has returned the buyer's money. Book all three consequences in one
 * transaction or none of them:
 *
 *   1. release whatever of the hold is still outstanding, so the seller is not
 *      left with money attached to a sale that no longer happened;
 *   2. debit the earnings back;
 *   3. reverse the commission, because commission is charged on completed sales
 *      and this one did not complete.
 *
 * Item 3 is the one that gets forgotten, and it is the one that makes the platform
 * a party to a sale it has just unwound. The guard below refuses a commit where 1
 * and 2 happened without 3.
 */
final class SettleRefund
{
    public function __construct(
        private readonly UnitOfWork $uow,
        private readonly OrderRepository $orders,
        private readonly Ledger $ledger,
        private readonly CommissionRecorder $commission,
        private readonly Outbox $outbox,
    ) {
    }

    public function handle(string $orderId, string $reason): Order
    {
        $this->uow->begin();

        try {
            $order = $this->orders->require($orderId);

            $outstanding = $this->ledger->unreleasedHold($order->id);
            if (!$outstanding->isZero()) {
                $this->ledger->record(
                    $order->sellerId,
                    $order->id,
                    Ledger::TYPE_HOLD_RELEASE,
                    $outstanding,
                    'Hold closed by refund: ' . $reason,
                );
            }

            $this->ledger->record(
                $order->sellerId,
                $order->id,
                Ledger::TYPE_REFUND,
                $order->itemPrice,
                'Refunded to buyer: ' . $reason,
            );
            $this->commission->reverseForRefund(new CommissionableSale(
                orderId: $order->id,
                sellerId: $order->sellerId,
                category: $order->category,
                gross: $order->itemPrice,
            ), 'Sale reversed, commission returned: ' . $reason);

            $order->apply(Order::EV_REFUND_SETTLED);
            $this->orders->save($order);

            $this->outbox->publish('Order', $order->id, 'RefundSettled', [
                'refunded' => $order->buyerTotal->toRandString(),
                'seller_balance' => $this->ledger->sellerBalance($order->sellerId)->toRandString(),
            ]);

            $this->uow->commit();

            return $order;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
