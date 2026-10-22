<?php

declare(strict_types=1);

namespace NasTech\Orders;

use NasTech\Settlements\Ledger;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Close the loop: the buyer received the goods, the handover was confirmed by
 * both sides, so the held money becomes payable to the seller.
 *
 * This is the only handler that releases a hold, and it releases exactly what the
 * ledger says is outstanding rather than re-deriving an amount from current
 * prices. If a partial refund already reduced the hold, it releases the remainder.
 */
final class CompleteOrder
{
    public function __construct(
        private readonly UnitOfWork $uow,
        private readonly OrderRepository $orders,
        private readonly Ledger $ledger,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(string $orderId): Order
    {
        $this->uow->begin();

        try {
            $order = $this->orders->require($orderId);
            if ($order->handoverTokenId === null) {
                throw new \DomainException(
                    "Order {$orderId} cannot complete without a handover token: "
                    . 'release of held money requires proof both parties attended'
                );
            }
            // The token having reached HANDOVER_CONFIRMED is enforced by the state
            // machine: ORDER_COMPLETED is only accepted from HANDOVER_CONFIRMED.
            $order->apply(Order::EV_ORDER_COMPLETED);
            $order->completedAt = $this->clock->now();

            $outstanding = $this->ledger->unreleasedHold($order->id);
            if ($outstanding->isZero()) {
                throw new \DomainException(sprintf(
                    'Order %s has no outstanding hold to release; the payment was never recorded '
                    . 'or the hold was already released. Rolling back.',
                    $order->id,
                ));
            }
            $this->ledger->record(
                $order->sellerId,
                $order->id,
                Ledger::TYPE_HOLD_RELEASE,
                $outstanding,
                'Handover confirmed; earnings payable to seller',
            );

            $this->orders->save($order);

            $this->outbox->publish('Order', $order->id, 'OrderCompleted', [
                'released' => $outstanding->toRandString(),
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
