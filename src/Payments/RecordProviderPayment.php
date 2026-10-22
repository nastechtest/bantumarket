<?php

declare(strict_types=1);

namespace NasTech\Payments;

use NasTech\Commissions\CommissionableSale;
use NasTech\Commissions\CommissionEntry;
use NasTech\Commissions\CommissionRecorder;
use NasTech\Orders\Order;
use NasTech\Orders\OrderRepository;
use NasTech\Settlements\Ledger;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Record a captured payment from the provider.
 *
 * One transaction, four writes: the inbox claim, the order transition, the two
 * ledger rows (seller earnings and commission), and the pricing evidence. Either
 * all of it commits or none does — which is the only arrangement in which a
 * webhook that arrives twice, arrives out of order, or dies halfway is still
 * survivable.
 */
final class RecordProviderPayment
{
    public const DISCREPANCY_TABLE = 'payment_discrepancies';

    public function __construct(
        private readonly Store $store,
        private readonly UnitOfWork $uow,
        private readonly OrderRepository $orders,
        private readonly PaymentInbox $inbox,
        private readonly Ledger $ledger,
        private readonly CommissionRecorder $commission,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(WebhookEvent $event): PaymentRecordingResult
    {
        $this->uow->begin();

        try {
            if (!$this->inbox->claim($event->provider, $event->providerEventId, $event->orderId, $event->type)) {
                $this->uow->rollback();

                return PaymentRecordingResult::duplicate();
            }

            $order = $this->orders->require($event->orderId);

            // The provider says it captured this much. If that is not the order
            // total, no amount of state machine cleverness makes it safe to mark
            // the order paid — so it is quarantined for a human instead.
            if (!$event->amount->equals($order->buyerTotal)) {
                $this->store->insert(self::DISCREPANCY_TABLE, [
                    'id' => Id::generate('pdy')->value(),
                    'order_id' => $order->id,
                    'provider' => $event->provider,
                    'provider_event_id' => $event->providerEventId,
                    'expected_cents' => $order->buyerTotal->cents,
                    'received_cents' => $event->amount->cents,
                    'currency' => $event->amount->currency,
                    'observed_at' => $this->clock->now()->format(\DateTimeInterface::ATOM),
                    'resolved_at' => null,
                ]);
                $this->uow->commit();

                return PaymentRecordingResult::discrepancy();
            }

            $order->apply(Order::EV_PAYMENT_RECORDED);
            $order->paidAt = $this->clock->now();
            $this->orders->save($order);

            // Earnings first so the commission debit is netted against a balance
            // that exists; order is irrelevant to the guard, which reads the table.
            // Earnings are the item price, not the captured total: any buyer-side
            // fee in that total is the platform's, and crediting it to the seller is
            // how a marketplace pays out money it never took as commission.
            $this->ledger->record(
                $order->sellerId,
                $order->id,
                Ledger::TYPE_SELLER_EARNINGS,
                $order->itemPrice,
                'Buyer payment captured by ' . $event->provider,
            );
            $entry = $this->commission->charge(new CommissionableSale(
                orderId: $order->id,
                sellerId: $order->sellerId,
                category: $order->category,
                // Earnings are the item price, not the captured total.
                gross: $order->itemPrice,
            ));

            // The seller's net is held, not payable: commission on a completed
            // sale means the handover has to happen before the money can leave.
            $this->ledger->record(
                $order->sellerId,
                $order->id,
                Ledger::TYPE_HOLD,
                $entry->sellerNet,
                'Held until handover is confirmed and the order completes',
            );

            $this->outbox->publish('Order', $order->id, 'PaymentRecorded', [
                'gross' => $event->amount->toRandString(),
                'commission' => $entry->commission->toRandString(),
                'seller_net' => $entry->sellerNet->toRandString(),
            ]);

            $this->uow->commit();

            return PaymentRecordingResult::accepted($entry);
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    /**
     * @return list<array<string,mixed>>
     */
    public function discrepancies(): array
    {
        return $this->store->all(self::DISCREPANCY_TABLE);
    }
}
