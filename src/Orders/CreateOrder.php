<?php

declare(strict_types=1);

namespace NasTech\Orders;

use NasTech\Listings\Listing;
use NasTech\Listings\ListingRepository;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Create an order against a listing.
 *
 * The order copies the listing's category and price rather than pointing at the
 * listing, because those two values decide what the platform charges and the
 * answer must not change when somebody edits the listing afterwards. The buyer
 * total is carried separately from the item price: the difference is the
 * platform's, not the seller's.
 */
final class CreateOrder
{
    public function __construct(
        private readonly UnitOfWork $uow,
        private readonly ListingRepository $listings,
        private readonly OrderRepository $orders,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(string $listingId, string $buyerId, Money $buyerTotal): Order
    {
        $this->uow->begin();

        try {
            $listing = $this->listings->require($listingId);
            if ($listing->status !== Listing::ACTIVE) {
                throw new \DomainException("Listing {$listing->id} is {$listing->status}; it cannot be ordered");
            }
            if ($listing->sellerId === $buyerId) {
                throw new \DomainException('A seller cannot buy their own listing; self-sales are how balances are invented');
            }
            if ($buyerTotal->lt($listing->price)) {
                throw new \DomainException(sprintf(
                    'Buyer total %s is below the item price %s',
                    $buyerTotal->toRandString(),
                    $listing->price->toRandString(),
                ));
            }

            $order = new Order(
                id: Id::generate('ord')->value(),
                listingId: $listing->id,
                buyerId: $buyerId,
                sellerId: $listing->sellerId,
                category: $listing->category,
                itemPrice: $listing->price,
                buyerTotal: $buyerTotal,
                status: Order::AWAITING_PAYMENT,
                version: 1,
                createdAt: $this->clock->now(),
            );

            $this->orders->save($order);
            $listing->status = Listing::RESERVED;
            $this->listings->save($listing);

            $this->outbox->publish('Order', $order->id, 'OrderCreated', [
                'listing_id' => $listing->id,
                'item_price' => $order->itemPrice->toRandString(),
                'buyer_total' => $order->buyerTotal->toRandString(),
            ]);

            $this->uow->commit();

            return $order;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
