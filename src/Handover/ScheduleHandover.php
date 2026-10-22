<?php

declare(strict_types=1);

namespace NasTech\Handover;

use NasTech\Orders\Order;
use NasTech\Orders\OrderRepository;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Schedule an in-person exchange and issue its two-sided token.
 *
 * There is no path through this handler that produces a PAID order. The state
 * machine only accepts HANDOVER_SCHEDULED from PAID, so scheduling a handover on
 * an unpaid order raises IllegalTransition and the transaction rolls back. That
 * is the structural answer to v1.0 line 545: the PIN cannot mark anything paid,
 * because a PIN-having order was already paid.
 */
final class ScheduleHandover
{
    public function __construct(
        private readonly UnitOfWork $uow,
        private readonly OrderRepository $orders,
        private readonly HandoverTokenStore $tokens,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
        private readonly string $pepper,
        private readonly \DateInterval $window,
    ) {
    }

    public function handle(string $orderId): ScheduledHandover
    {
        $this->uow->begin();

        try {
            $order = $this->orders->require($orderId);

            // Reissue is a legitimate request — the parties lost the code, or the
            // window expired — but it is not a state change. Only the first issue
            // advances the order, and the state machine is what says so.
            $isReissue = $order->status === Order::HANDOVER_SCHEDULED;
            if (!$isReissue) {
                $order->apply(Order::EV_HANDOVER_SCHEDULED);
            }

            $now = $this->clock->now();
            $pin = $this->pin();

            $previous = $this->tokens->activeForOrder($order->id);
            if ($previous !== null) {
                $previous->revoked = true;
                $this->tokens->save($previous);
            }

            $token = HandoverToken::issue(
                id: Id::generate('hdt')->value(),
                orderId: $order->id,
                pin: $pin,
                pepper: $this->pepper,
                buyerId: $order->buyerId,
                sellerId: $order->sellerId,
                issuedAt: $now,
                expiresAt: $now->add($this->window),
                heldValue: $order->buyerTotal,
            );

            $order->attachHandoverToken($token->id);
            $this->tokens->save($token);
            $this->orders->save($order);

            $this->outbox->publish('Order', $order->id, 'HandoverScheduled', [
                'token_id' => $token->id,
                'expires_at' => $token->expiresAt->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            // The PIN leaves this call once, over an authenticated channel to
            // each party, and is never accepted from a client again afterwards.
            return new ScheduledHandover($token, $pin);
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    private function pin(): string
    {
        // 1e6 combinations is not a secret, which is why attempts are capped, the
        // token is order-scoped and salted, and money does not move on this PIN
        // alone — both parties must present it.
        do {
            $candidate = (string) random_int(100000, 999999);
        } while (preg_match('/^(\d)\1{5}$/', $candidate) === 1 || $candidate === '123456');

        return $candidate;
    }
}
