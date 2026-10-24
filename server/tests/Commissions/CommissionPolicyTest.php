<?php

declare(strict_types=1);

namespace NasTech\Tests\Commissions;

use NasTech\Commissions\CommissionEntry;
use NasTech\Commissions\CommissionableSale;
use NasTech\Commissions\CommissionIntegrityViolation;
use NasTech\Commissions\CommissionPolicy;
use NasTech\Commissions\CommissionPolicyRegistry;
use NasTech\Commissions\NoCommissionPolicy;
use NasTech\Orders\Order;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;
use NasTech\Tests\Support\MoneyFixture;
use NasTech\Tests\TestCase;

/**
 * Policy governance: what a rate may say, and what happens when two rates speak
 * at once.
 *
 * The commercial rule behind these tests is that a commission is defensible to
 * the seller only if the platform can name the policy, the rate and the instant.
 * Every ambiguity — two live windows, no window, a floor that outruns a cap — is
 * therefore a refusal at write time rather than a judgement call at invoice time.
 */
final class CommissionPolicyTest extends TestCase
{
    private const CATEGORY = 'electronics';

    public function testTwoLiveWindowsForOneCategoryAreRefused(): void
    {
        $registry = new CommissionPolicyRegistry([
            $this->policy('pol_a', self::CATEGORY, '2026-01-01', '2026-12-31', 0.07),
        ]);

        $this->assertThrows(
            \DomainException::class,
            fn () => $registry->add($this->policy('pol_b', self::CATEGORY, '2026-06-01', '2027-06-01', 0.09)),
            'Overlapping commission policies',
        );
    }

    public function testTwoPoliciesForDifferentCategoriesDoNotCollide(): void
    {
        $registry = new CommissionPolicyRegistry([
            $this->policy('pol_elec', self::CATEGORY, '2026-01-01', '2027-01-01', 0.07),
            $this->policy('pol_furn', 'furniture', '2026-01-01', '2027-01-01', 0.10),
        ]);

        $at = new \DateTimeImmutable('2026-06-01T09:00:00+02:00');
        $this->assertSame('pol_elec', $registry->resolve(self::CATEGORY, $at)->id);
        $this->assertSame('pol_furn', $registry->resolve('furniture', $at)->id);
    }

    public function testWindowsThatShareABoundaryInstantDoNotOverlap(): void
    {
        // The window is [from, to): the instant a policy stops is the instant the
        // next one starts, so a changeover at midnight needs no gap and no overlap.
        $registry = new CommissionPolicyRegistry([
            $this->policy('pol_old', self::CATEGORY, '2026-01-01', '2026-11-01', 0.07),
            $this->policy('pol_new', self::CATEGORY, '2026-11-01', '2027-01-01', 0.09),
        ]);

        $before = new \DateTimeImmutable('2026-10-31T23:59:59+02:00');
        $after = new \DateTimeImmutable('2026-11-01T00:00:00+02:00');

        $this->assertSame('pol_old', $registry->resolve(self::CATEGORY, $before)->id);
        $this->assertSame('pol_new', $registry->resolve(self::CATEGORY, $after)->id);
    }

    public function testTheInstantInsideAGapHasNoRateAndSaysSo(): void
    {
        $registry = new CommissionPolicyRegistry([
            $this->policy('pol_jan_jun', self::CATEGORY, '2026-01-01', '2026-07-01', 0.07),
            $this->policy('pol_sep_dec', self::CATEGORY, '2026-09-01', '2027-01-01', 0.09),
        ]);

        $thrown = $this->assertThrows(
            NoCommissionPolicy::class,
            fn () => $registry->resolve(self::CATEGORY, new \DateTimeImmutable('2026-08-01T09:00:00+02:00')),
            'No commission policy covers category',
        );

        // The message must carry enough to act on: which category, which instant,
        // and what the registry does know.
        $this->assertStringContains('2026-08-01', $thrown->getMessage());
        $this->assertStringContains('pol_jan_jun', $thrown->getMessage());
        $this->assertStringContains('pol_sep_dec', $thrown->getMessage());
    }

    public function testACategoryNobodyDeclaredARateForIsRefusedNotDefaulted(): void
    {
        $registry = new CommissionPolicyRegistry([
            $this->policy('pol_elec', self::CATEGORY, '2026-01-01', '2027-01-01', 0.07),
        ]);

        $thrown = $this->assertThrows(
            NoCommissionPolicy::class,
            fn () => $registry->resolve('vehicles', new \DateTimeImmutable('2026-06-01T09:00:00+02:00')),
            'No commission policy covers category "vehicles"',
        );
        $this->assertStringContains('(none declared)', $thrown->getMessage());
        $this->assertFalse($registry->has('vehicles'));
        $this->assertTrue($registry->has(self::CATEGORY));
    }

    public function testAFloorBindsBelowItsPriceAndACapBindsAboveItsPrice(): void
    {
        $floor = $this->policy('pol_floor', self::CATEGORY, '2026-01-01', '2027-01-01', 0.07, '5.00');
        // R10 at 7% is R0.70, under the R5.00 minimum charge.
        $this->assertSame(500, $floor->commissionOn(Money::fromRand('10.00'))->cents);

        $cap = $this->policy('pol_cap', self::CATEGORY, '2026-01-01', '2027-01-01', 0.07, '5.00', '500.00');
        // R100 000 at 7% is R7 000, over the R500 ceiling.
        $this->assertSame(50000, $cap->commissionOn(Money::fromRand('100000.00'))->cents);

        // Between the two bounds, the rate itself is what is charged.
        $this->assertSame(9093, $cap->commissionOn(Money::fromRand('1299.00'))->cents);
    }

    public function testAFloorAboveTheCapIsRefusedWhenThePolicyIsWritten(): void
    {
        // Without this, commissionOn applies the floor before consulting the cap, so
        // the ceiling exists in the config and in the seller-facing terms and nowhere
        // in the money. The bound is checked where it is authored, not at charge time.
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $this->policy('pol_bad', self::CATEGORY, '2026-01-01', '2027-01-01', 0.07, '500.00', '100.00'),
            'floor of 500.00 above its cap',
        );
    }

    public function testARateOutsideTheGovernedBandIsRefused(): void
    {
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $this->policy('pol_greedy', self::CATEGORY, '2026-01-01', '2027-01-01', 0.60),
            'outside the governed',
        );

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $this->policy('pol_negative', self::CATEGORY, '2026-01-01', '2027-01-01', -0.01),
            'outside the governed',
        );

        // The edges of the band are allowed: 0% is a promo, 50% is the ceiling.
        $this->assertSame(0.0, $this->policy('pol_zero', self::CATEGORY, '2026-01-01', '2027-01-01', 0.0)->rate);
        $this->assertSame(0.5, $this->policy('pol_half', self::CATEGORY, '2026-01-01', '2027-01-01', 0.5)->rate);
    }

    public function testAPolicyThatCanNeverBeEffectiveIsRefused(): void
    {
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $this->policy('pol_backwards', self::CATEGORY, '2027-01-01', '2026-01-01', 0.07),
            'empty window',
        );

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $this->policy('pol_instant', self::CATEGORY, '2026-06-01', '2026-06-01', 0.07),
            'empty window',
        );
    }

    public function testTheSameSalePricedAThousandTimesGivesTheSameCents(): void
    {
        $policy = $this->policy('pol_det', self::CATEGORY, '2026-01-01', '2027-01-01', 0.07, '0.00');
        $price = Money::fromRand('1299.00');

        $first = $policy->commissionOn($price)->cents;
        for ($i = 0; $i < 1000; $i++) {
            $this->assertSame($first, $policy->commissionOn($price)->cents, 'replay ' . $i);
        }

        // A rate that lands on a fraction of a cent is resolved by rounding half up,
        // not by whatever the float happens to truncate to.
        $this->assertSame(7, $policy->commissionOn(Money::fromRand('1.00'))->cents);
        $this->assertSame(14, $policy->commissionOn(Money::fromRand('2.00'))->cents);
        $this->assertSame(105, $policy->commissionOn(Money::fromRand('15.00'))->cents);
    }

    public function testChargingAnOrderRecordsThePolicyThatProducedTheNumber(): void
    {
        $fx = new MoneyFixture();
        $entry = $fx->capture()->commission;
        $this->assertInstanceOf(CommissionEntry::class, $entry);

        $this->assertSame('pol_electronics_7pc', $entry->policyId);
        $this->assertSame(0.07, $entry->rate);
        $this->assertSame(self::CATEGORY, $entry->category);
        $this->assertSame(129900, $entry->gross->cents);
        $this->assertSame(9093, $entry->commission->cents);
        $this->assertSame(120807, $entry->sellerNet->cents);
        $this->assertSame(MoneyFixture::SELLER, $entry->sellerId);
        $this->assertNotSame('', (string) $entry->ledgerEntryId);
        $this->assertSame(CommissionEntry::KIND_FORWARD, $entry->kind);

        // gross less commission is what the seller is left with — the entry that is
        // shown to them has to add up, because that is the arithmetic they will check.
        $this->assertSame(
            $entry->gross->subtract($entry->commission)->cents,
            $entry->sellerNet->cents,
        );
    }

    public function testTheSameOrderCannotBeChargedTwice(): void
    {
        $fx = new MoneyFixture();
        $fx->capture();

        // A second charge of the same sale is the double-commission bug. The unique
        // index on (order_id, kind) is what stops it, inside the same transaction.
        $fx->kernel->uow->begin();
        try {
            $this->assertThrows(
                UniqueConstraintViolation::class,
                fn () => $fx->kernel->commission->charge($this->sale($fx)),
                'commission_entries',
            );
            $this->assertSame(1, count($fx->kernel->store->all(CommissionEntry::TABLE)));
        } finally {
            $fx->kernel->uow->rollback();
        }
    }

    public function testAReversalCopiesTheForwardPolicyRatherThanTheCurrentOne(): void
    {
        $fx = new MoneyFixture();
        $forward = $fx->capture()->commission;
        $this->assertInstanceOf(CommissionEntry::class, $forward);

        $fx->kernel->initiateRefund->handle($fx->orderId, 'goods not as described');
        $fx->kernel->settleRefund->handle($fx->orderId, 'goods not as described');

        $reversals = array_values(array_filter(
            $fx->kernel->store->all(CommissionEntry::TABLE),
            static fn (array $row): bool => (string) $row['kind'] === CommissionEntry::KIND_REVERSAL,
        ));
        $this->assertCount(1, $reversals);
        $reversal = CommissionEntry::fromRow($reversals[0]);

        $this->assertSame($forward->id, $reversal->reversalOf);

        // The reversal is priced from the stored forward entry, so a policy edit
        // between the sale and the refund cannot move the amount being returned.
        $this->assertSame($forward->policyId, $reversal->policyId);
        $this->assertSame($forward->rate, $reversal->rate);
        $this->assertSame(self::CATEGORY, $reversal->category);
        $this->assertSame(-$forward->commission->cents, $reversal->commission->cents);
        $this->assertSame(0, $forward->commission->add($reversal->commission)->cents);
    }

    public function testAFloorThatWouldTakeTheSellerNegativeRefusesTheCharge(): void
    {
        $fx = new MoneyFixture();
        $recorder = new \NasTech\Commissions\CommissionRecorder(
            $fx->kernel->store,
            $fx->kernel->ledger,
            new CommissionPolicyRegistry([
                $this->policy('pol_huge_floor', self::CATEGORY, '2026-01-01', '2027-01-01', 0.07, '5000.00'),
            ]),
            $fx->clock,
        );

        $fx->kernel->uow->begin();
        try {
            $this->assertThrows(
                CommissionIntegrityViolation::class,
                fn () => $recorder->charge($this->sale($fx, '30.00')),
                'leaving the seller negative',
            );
            $this->assertSame(0, $fx->kernel->ledger->count(), 'the refused charge wrote no money row');
        } finally {
            $fx->kernel->uow->rollback();
        }
    }

    public function testAPromoRateOfZeroBooksEvidenceButNoCommissionRow(): void
    {
        // No minimum charge: "no commission on this sale" has to mean zero, not the
        // R5.00 floor applied to a 0% rate.
        $fx = new MoneyFixture(0.0, '1299.00', '0.00');

        $before = $fx->ledgerCount();
        $result = $fx->capture();
        $this->assertSame('accepted', $result->status, 'the payment itself still books');

        $entry = $result->commission;
        $this->assertInstanceOf(CommissionEntry::class, $entry);
        $this->assertSame(0, $entry->commission->cents);
        $this->assertSame(129900, $entry->sellerNet->cents);
        $this->assertSame(null, $entry->ledgerEntryId, 'a zero commission must not write a zero money row');

        // Earnings and hold only — no COMMISSION row.
        $this->assertSame($before + 2, $fx->ledgerCount(), 'earnings and hold, no commission debit');
        $this->assertSame(0, $fx->kernel->ledger->netCommissionForOrder($fx->orderId)->cents);

        // Refunding a zero-commission sale needs no reversal, so the refund guard
        // that demands one must not fire.
        $fx->kernel->initiateRefund->handle($fx->orderId, 'buyer changed mind');
        $refunded = $fx->kernel->settleRefund->handle($fx->orderId, 'buyer changed mind');
        $this->assertSame(Order::REFUNDED, $refunded->status);
        $this->assertSame(0, $fx->kernel->ledger->sellerBalance(MoneyFixture::SELLER)->cents);
    }

    private function sale(MoneyFixture $fx, string $gross = '1299.00'): CommissionableSale
    {
        $order = $fx->kernel->orders->require($fx->orderId);

        return new CommissionableSale(
            orderId: $order->id,
            sellerId: $order->sellerId,
            category: $order->category,
            gross: Money::fromRand($gross),
        );
    }

    private function policy(
        string $id,
        string $category,
        string $from,
        string $to,
        float $rate,
        string $floor = '5.00',
        ?string $cap = null,
    ): CommissionPolicy {
        return new CommissionPolicy(
            id: $id,
            category: $category,
            rate: $rate,
            floor: Money::fromRand($floor),
            cap: $cap === null ? null : Money::fromRand($cap),
            effectiveFrom: new \DateTimeImmutable($from . 'T00:00:00+02:00'),
            effectiveTo: new \DateTimeImmutable($to . 'T00:00:00+02:00'),
            reason: 'test policy',
        );
    }
}
