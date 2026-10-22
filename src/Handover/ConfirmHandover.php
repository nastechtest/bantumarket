<?php

declare(strict_types=1);

namespace NasTech\Handover;

use NasTech\Orders\Order;
use NasTech\Orders\OrderRepository;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Present a handover PIN for one role.
 *
 * Money does not move here. This advances the order to HANDOVER_CONFIRMED, which
 * is a precondition for release, not the release itself — the seller gets paid
 * only when the order completes. A failed presentation still commits, because the
 * attempt counter is rate-limit state that must survive the request.
 */
final class ConfirmHandover
{
    public function __construct(
        private readonly UnitOfWork $uow,
        private readonly OrderRepository $orders,
        private readonly HandoverTokenStore $tokens,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
        private readonly string $pepper,
    ) {
    }

    /**
     * @param string $actorId The authenticated principal from the gateway. It is
     *                        never taken from the request body: a caller who can
     *                        name themselves as the counterparty could confirm the
     *                        other side of their own handover.
     */
    public function handle(string $tokenId, string $role, string $pin, string $actorId): ConfirmationResult
    {
        $this->uow->begin();

        try {
            $token = $this->tokens->require($tokenId);
            $partyId = match ($role) {
                'buyer' => $token->buyerId,
                'seller' => $token->sellerId,
                default => throw new \InvalidArgumentException("Unknown handover role: {$role}"),
            };
            if ($actorId !== $partyId) {
                throw new HandoverRejected(
                    "Actor is not the {$role} on this handover; each side must present the PIN themselves"
                );
            }

            $accepted = $token->present($role, $pin, $this->pepper, $this->clock->now());
            $this->tokens->save($token);

            if (!$accepted || !$token->isComplete()) {
                $this->uow->commit();

                return new ConfirmationResult(
                    accepted: $accepted,
                    complete: $token->isComplete(),
                    awaiting: $token->buyerConfirmed ? 'seller' : 'buyer',
                    attemptsRemaining: max(0, HandoverToken::MAX_ATTEMPTS - $token->attempts),
                    locked: $token->locked,
                );
            }

            $order = $this->orders->require($token->orderId);
            $order->apply(Order::EV_HANDOVER_CONFIRMED);
            $order->handoverConfirmedAt = $this->clock->now();
            $this->orders->save($order);

            $this->outbox->publish('Order', $order->id, 'HandoverConfirmed', [
                'token_id' => $token->id,
                'confirmed_at' => $order->handoverConfirmedAt->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return new ConfirmationResult(
                accepted: true,
                complete: true,
                awaiting: null,
                attemptsRemaining: max(0, HandoverToken::MAX_ATTEMPTS - $token->attempts),
                locked: false,
            );
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
