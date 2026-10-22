<?php

declare(strict_types=1);

namespace NasTech\Commissions;

use NasTech\SharedKernel\Money;

/**
 * What the commission engine is allowed to know about a sale.
 *
 * This exists instead of an Order parameter because the module graph has one edge
 * between these two modules — orders -> commissions — and passing the aggregate
 * would give the commission engine a writable handle on order state. Order.status
 * and Order.version are public by necessity; a policy engine has no business
 * touching either. The caller extracts four facts, and the boundary becomes the
 * kind that does not depend on everybody remembering it.
 */
final class CommissionableSale
{
    public function __construct(
        public readonly string $orderId,
        public readonly string $sellerId,
        public readonly string $category,
        public readonly Money $gross,
    ) {
        if ($orderId === '') {
            throw new \InvalidArgumentException('A commission must be attached to an order');
        }

        // The category is the policy lookup key. An empty one is not "unclassified",
        // it is a silent mis-pricing, so it is refused here rather than resolved.
        if ($category === '') {
            throw new \InvalidArgumentException(sprintf(
                'Order %s has no category, so no commission policy can be resolved for it',
                $orderId,
            ));
        }
    }
}
