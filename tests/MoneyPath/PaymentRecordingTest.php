<?php

declare(strict_types=1);

namespace NasTech\Tests\MoneyPath;

use NasTech\Payments\PaymentRecordingResult;
use NasTech\Settlements\Ledger;
use NasTech\SharedKernel\Money;
use NasTech\Tests\AssertionFailed;
use NasTech\Tests\Support\MoneyFixture;
use NasTech\Tests\TestCase;

/**
 * The happy path, asserted as an equation rather than as a screenshot.
 *
 * If these numbers do not add up, every downstream report is wrong: seller
 * balances, the commission line in the P&L, and the reconciliation against the
 * provider file all read from these rows.
 */
final class PaymentRecordingTest extends TestCase
{
    private MoneyFixture $fx;

    public function setUp(): void
    {
        $this->fx = new MoneyFixture();
    }

    public function testCapturedPaymentMovesTheOrderToPaid(): void
    {
        $result = $this->fx->capture();

        $this->assertSame(PaymentRecordingResult::ACCEPTED, $result->status);
        $this->assertSame('PAID', $this->fx->orderStatus());
    }

    public function testPaymentWritesEarningsCommissionAndHoldInTheSameTransaction(): void
    {
        $this->fx->capture();

        $types = array_map(
            static fn (array $row): string => (string) $row['entry_type'],
            $this->fx->kernel->ledger->entriesForOrder($this->fx->orderId),
        );
        sort($types);

        $this->assertSame(
            [Ledger::TYPE_COMMISSION, Ledger::TYPE_HOLD, Ledger::TYPE_SELLER_EARNINGS],
            $types,
            'a captured payment must book exactly these three rows',
        );
    }

    public function testAmountsNetToTheExactSellerPayable(): void
    {
        $this->fx->capture();

        // 1299.00 at 7% = 90.93 commission, 1208.07 held for the seller.
        $entries = $this->entries();

        $this->assertSame(129900, $entries[Ledger::TYPE_SELLER_EARNINGS]);
        $this->assertSame(-9093, $entries[Ledger::TYPE_COMMISSION]);
        $this->assertSame(-120807, $entries[Ledger::TYPE_HOLD]);

        $this->assertSame(
            0,
            $this->fx->kernel->ledger->sellerBalance(MoneyFixture::SELLER)->cents,
            'paid but not handed over means nothing is payable yet',
        );
    }

    public function testNothingIsPayableUntilTheSaleCompletes(): void
    {
        $this->fx->capture();
        $this->assertFalsePayable();

        // completeSale() starts from an unpaid order, so drive the rest by hand.
        [$tokenId, $pin] = $this->fx->scheduledHandover();
        $this->fx->kernel->confirmHandover->handle($tokenId, 'buyer', $pin, MoneyFixture::BUYER);
        $this->fx->kernel->confirmHandover->handle($tokenId, 'seller', $pin, MoneyFixture::SELLER);
        $this->fx->kernel->completeOrder->handle($this->fx->orderId);
        $this->assertSame(
            120807,
            $this->fx->kernel->ledger->sellerBalance(MoneyFixture::SELLER)->cents,
            'on completion the hold releases and the net becomes payable',
        );
    }

    public function testCommissionEvidenceStoresTheRateThatProducedIt(): void
    {
        $result = $this->fx->capture();
        $entry = $this->fx->kernel->commission->forwardEntryFor($this->fx->orderId);

        $this->assertSame('pol_electronics_7pc', $entry->policyId);
        $this->assertSame(0.07, $entry->rate);
        $this->assertSame(129900, $entry->gross->cents);
        $this->assertSame(9093, $entry->commission->cents);
        $this->assertSame(120807, $entry->sellerNet->cents);
        $this->assertSame(PaymentRecordingResult::ACCEPTED, $result->status);
    }

    public function testAReplayedWebhookMovesNoMoney(): void
    {
        $first = $this->fx->capture(null, 'evt_repeat');
        $this->assertSame(PaymentRecordingResult::ACCEPTED, $first->status);

        $second = $this->fx->capture(null, 'evt_repeat');
        $this->assertSame(PaymentRecordingResult::DUPLICATE, $second->status);
        $this->assertSame(3, $this->fx->ledgerCount(), 'the replay must not append rows');
    }

    public function testAnAmountThatDoesNotMatchTheOrderIsQuarantinedNotApplied(): void
    {
        $result = $this->fx->capture('99.00');

        $this->assertSame(PaymentRecordingResult::DISCREPANCY, $result->status);
        $this->assertSame('AWAITING_PAYMENT', $this->fx->orderStatus());
        $this->assertSame(0, $this->fx->ledgerCount());
        $this->assertCount(1, $this->fx->kernel->recordPayment->discrepancies());
    }

    public function testACommitThatFailsLeavesNoTraceOfThePayment(): void
    {
        $this->fx->kernel->uow->failNextCommit(new AssertionFailed('simulated storage failure at commit'));

        $this->assertThrows(
            AssertionFailed::class,
            fn () => $this->fx->capture(),
            'simulated storage failure',
        );

        $this->assertSame('AWAITING_PAYMENT', $this->fx->orderStatus());
        $this->assertSame(0, $this->fx->ledgerCount());
        $this->assertSame(0, $this->fx->dispatchedMessages());
    }

    public function testEventsAreDispatchedOnlyAfterTheTransactionCommits(): void
    {
        $this->assertSame(0, $this->fx->dispatchedMessages());
        $this->fx->capture();
        $this->assertSame(1, $this->fx->dispatchedMessages());
    }

    /**
     * @return array<string,int> entry type => signed cents
     */
    private function entries(): array
    {
        $out = [];
        foreach ($this->fx->kernel->ledger->entriesForOrder($this->fx->orderId) as $row) {
            $out[(string) $row['entry_type']] = (int) $row['amount_cents'];
        }

        return $out;
    }

    private function assertFalsePayable(): void
    {
        $balance = $this->fx->kernel->ledger->sellerBalance(MoneyFixture::SELLER);
        if (!$balance->equals(Money::zero())) {
            $this->fail('expected nothing payable after payment, got ' . $balance->toRandString());
        }
    }
}
