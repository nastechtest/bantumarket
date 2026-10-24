<?php

declare(strict_types=1);

namespace NasTech\Settlements;

use NasTech\Orders\Order;
use NasTech\Orders\OrderRepository;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Open a refund. Deliberately writes nothing to the ledger.
 *
 * A refund request is not money moving; if it were booked as such, a refund the
 * buyer cancels the next minute would leave a debit that only a second, invented
 * entry could clear. The state advances, the obligation is noted, and the money
 * waits for the provider to confirm.
 */
final class InitiateRefund
{
    public function __construct(
        private readonly UnitOfWork $uow,
        private readonly OrderRepository $orders,
        private readonly Outbox $outbox,
    ) {
    }

    public function handle(string $orderId, string $reason): Order
    {
        $this->uow->begin();

        try {
            $order = $this->orders->require($orderId);
            $order->apply(Order::EV_REFUND_INITIATED);
            $this->orders->save($order);

            $this->outbox->publish('Order', $order->id, 'RefundInitiated', [
                'reason' => $reason,
                'amount' => $order->buyerTotal->toRandString(),
            ]);

            $this->uow->commit();

            return $order;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
