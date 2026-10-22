<?php

declare(strict_types=1);

namespace NasTech\Orders;

use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Persistence\Store;

final class OrderRepository
{
    public const TABLE = 'orders';

    public function __construct(private readonly Store $store)
    {
    }

    public function save(Order $order): void
    {
        $row = [
            'id' => $order->id,
            'listing_id' => $order->listingId,
            'buyer_id' => $order->buyerId,
            'seller_id' => $order->sellerId,
            'category' => $order->category,
            'item_price_cents' => $order->itemPrice->cents,
            'buyer_total_cents' => $order->buyerTotal->cents,
            'currency' => $order->itemPrice->currency,
            'status' => $order->status,
            'version' => $order->version,
            'paid_at' => $order->paidAt?->format(\DateTimeInterface::ATOM),
            'handover_confirmed_at' => $order->handoverConfirmedAt?->format(\DateTimeInterface::ATOM),
            'completed_at' => $order->completedAt?->format(\DateTimeInterface::ATOM),
            'handover_token_id' => $order->handoverTokenId,
        ];

        $existing = $this->store->find(self::TABLE, $order->id);
        if ($existing === null) {
            $this->store->insert(self::TABLE, $row);

            return;
        }

        // Optimistic locking: a stale aggregate cannot overwrite a newer one.
        // This is the second layer of double-payout protection, behind the
        // provider event id uniqueness.
        if ((int) $existing['version'] !== $order->loadedVersion()) {
            throw new StaleOrderVersion(sprintf(
                'Order %s was loaded at version %d but the store now holds %d; refusing to overwrite',
                $order->id,
                $order->loadedVersion(),
                (int) $existing['version'],
            ));
        }
        if ($order->version <= $order->loadedVersion()) {
            throw new StaleOrderVersion(sprintf(
                'Order %s is being saved without any change since it was loaded at version %d',
                $order->id,
                $order->loadedVersion(),
            ));
        }
        $this->store->update(self::TABLE, $row);
    }

    public function find(string $id): ?Order
    {
        $row = $this->store->find(self::TABLE, $id);
        if ($row === null) {
            return null;
        }

        return new Order(
            id: (string) $row['id'],
            listingId: (string) $row['listing_id'],
            buyerId: (string) $row['buyer_id'],
            sellerId: (string) $row['seller_id'],
            category: (string) $row['category'],
            itemPrice: Money::fromCents((int) $row['item_price_cents'], (string) $row['currency']),
            buyerTotal: Money::fromCents((int) $row['buyer_total_cents'], (string) $row['currency']),
            status: (string) $row['status'],
            version: (int) $row['version'],
            createdAt: null,
            paidAt: $row['paid_at'] === null ? null : new \DateTimeImmutable((string) $row['paid_at']),
            handoverConfirmedAt: $row['handover_confirmed_at'] === null
                ? null
                : new \DateTimeImmutable((string) $row['handover_confirmed_at']),
            completedAt: $row['completed_at'] === null
                ? null
                : new \DateTimeImmutable((string) $row['completed_at']),
            handoverTokenId: $row['handover_token_id'] === null ? null : (string) $row['handover_token_id'],
        );
    }

    public function require(string $id): Order
    {
        $order = $this->find($id);
        if ($order === null) {
            throw new \RuntimeException("Unknown order: {$id}");
        }

        return $order;
    }
}
