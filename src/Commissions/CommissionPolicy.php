<?php

declare(strict_types=1);

namespace NasTech\Commissions;

use NasTech\SharedKernel\Money;

/**
 * Tenant-configurable commission policy.
 *
 * Built in-house rather than bought, because no South African provider offers a
 * marketplace commission ledger with per-category policy — this is the product,
 * not a commodity. The corollary is that policy changes must not silently
 * re-price history, so entries store the rate that produced them.
 */
final class CommissionPolicy
{
    public function __construct(
        public readonly string $id,
        public readonly string $category,
        public readonly float $rate,
        public readonly Money $floor,
        public readonly ?Money $cap,
        public readonly \DateTimeImmutable $effectiveFrom,
        public readonly \DateTimeImmutable $effectiveTo,
        public readonly string $reason,
    ) {
        if ($rate < 0.0 || $rate > 0.5) {
            throw new \InvalidArgumentException(sprintf(
                'Commission rate %.4f outside the governed 0–50%% band',
                $rate,
            ));
        }

        // The floor is applied before the cap is consulted, so a floor above the cap
        // would quietly charge more than the policy's stated maximum — the cap would
        // exist in the config and in the seller-facing terms and nowhere in the money.
        if ($cap !== null && $floor->gt($cap)) {
            throw new \InvalidArgumentException(sprintf(
                'Policy %s has a floor of %s above its cap of %s; the two bounds contradict each other',
                $id,
                $floor->toRandString(),
                $cap->toRandString(),
            ));
        }

        if ($effectiveFrom >= $effectiveTo) {
            throw new \InvalidArgumentException(sprintf(
                'Policy %s is effective from %s to %s; an empty window can never be resolved',
                $id,
                $effectiveFrom->format('Y-m-d H:i'),
                $effectiveTo->format('Y-m-d H:i'),
            ));
        }
    }

    public function appliesTo(\DateTimeImmutable $at): bool
    {
        return $at >= $this->effectiveFrom && $at < $this->effectiveTo;
    }

    /**
     * Deterministic: same price, same policy, same answer — on every replay.
     */
    public function commissionOn(Money $itemPrice): Money
    {
        $raw = $itemPrice->multiplyRate($this->rate);
        if ($raw->lt($this->floor)) {
            return $this->floor;
        }
        if ($this->cap !== null && $raw->gt($this->cap)) {
            return $this->cap;
        }

        return $raw;
    }
}
