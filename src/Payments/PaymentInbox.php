<?php

declare(strict_types=1);

namespace NasTech\Payments;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;

/**
 * Idempotent provider event log.
 *
 * The provider will deliver the same event again — it is a queue, not a
 * promise. Claiming the event id inside the money transaction means the second
 * delivery is a no-op rather than a second payout. Claiming it *after* the
 * transaction would be the dual-write bug.
 */
final class PaymentInbox
{
    public const TABLE = 'provider_events';

    public function __construct(
        private readonly Store $store,
        private readonly Clock $clock,
    ) {
    }

    /**
     * Returns false when this event has already been claimed by a committed
     * transaction. true means the caller holds the right to move money for it.
     */
    public function claim(string $provider, string $providerEventId, string $orderId, string $eventType): bool
    {
        try {
            $this->store->insert(self::TABLE, [
                'id' => Id::generate('pev')->value(),
                'provider' => $provider,
                'provider_event_id' => $providerEventId,
                'order_id' => $orderId,
                'event_type' => $eventType,
                'claimed_at' => $this->clock->now()->format(\DateTimeInterface::ATOM),
            ]);

            return true;
        } catch (UniqueConstraintViolation) {
            // The only expected failure: (provider, provider_event_id) is already
            // claimed, so this is a redelivery and the caller must not move money.
            // Deliberately not a broad catch — swallowing a TypeError or a missing
            // table here would read as "duplicate" and silently drop a payment.
            return false;
        }
    }

    public function seen(string $provider, string $providerEventId): bool
    {
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['provider'] === $provider
                && (string) $row['provider_event_id'] === $providerEventId) {
                return true;
            }
        }

        return false;
    }

    public function count(): int
    {
        return count($this->store->all(self::TABLE));
    }
}
