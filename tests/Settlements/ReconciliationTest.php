<?php

declare(strict_types=1);

namespace NasTech\Tests\Settlements;

use NasTech\Settlements\ReconciliationReport;
use NasTech\Settlements\SettlementLine;
use NasTech\SharedKernel\Money;
use NasTech\Tests\Support\MoneyFixture;
use NasTech\Tests\TestCase;

/**
 * Reconciliation: the provider's file against our ledger, with neither trusted.
 *
 * Transaction guards prove our own books are internally consistent. They cannot
 * prove the provider and our books agree — that is what this is for, and it is why
 * the checks run in both directions: money in the file we never booked, and money
 * in the ledger the file never settled.
 */
final class ReconciliationTest extends TestCase
{
    private const GROSS = '1299.00';
    private const TAKE = '90.93';
    private const NET = '1208.07';

    private MoneyFixture $fx;

    public function setUp(): void
    {
        $this->fx = new MoneyFixture();
    }

    public function testAFileThatMatchesTheLedgerIsClean(): void
    {
        $this->fx->completeSale();

        $report = $this->reconcile([$this->line($this->fx->orderId)]);

        $this->assertTrue($report->isClean(), implode(' | ', $report->summaryLines()));
        $this->assertSame(1, $report->linesChecked);
        $this->assertSame(1, $report->ledgerOrdersChecked);
    }

    public function testALineThatDoesNotAddUpIsRefusedBeforeAnyComparison(): void
    {
        // Parsing is a check, not a read: a row whose own arithmetic is wrong cannot
        // be reconciled against anything, and silently accepting it would reconcile
        // the wrong number.
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $this->line('ord_1', '1299.00', '90.93', '1200.00'),
            'does not add up',
        );

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $this->line('', self::GROSS, self::TAKE, self::NET),
            'no order reference',
        );
    }

    public function testMoneyInTheFileWithNoLedgerRowIsReported(): void
    {
        $this->fx->completeSale();

        $report = $this->reconcile([
            $this->line($this->fx->orderId),
            $this->line('ord_never_seen'),
        ]);

        $this->assertSame('unbooked_settlement', $report->discrepancies[0]['kind']);
        $this->assertSame('ord_never_seen', $report->discrepancies[0]['order_id']);
        $this->assertSame(
            Money::fromRand(self::NET)->toRandString(),
            $report->discrepancies[0]['observed'],
            'the file paid out money we have no ledger for',
        );
        $this->assertSame('a ledger for this order', $report->discrepancies[0]['expected']);
    }

    public function testASettledOrderAbsentFromTheFileIsReported(): void
    {
        $this->fx->completeSale();

        $report = $this->reconcile([]);

        $this->assertFalse($report->isClean());
        $this->assertSame('unsettled_ledger', $report->discrepancies[0]['kind']);
        $this->assertSame($this->fx->orderId, $report->discrepancies[0]['order_id']);
        // The count that matters to finance: this is a balance we would pay out and
        // cannot cover from the settlement that arrived.
        $this->assertSame(1, $report->ledgerOrdersChecked);
        $this->assertSame(0, $report->linesChecked);
    }

    public function testAWrongPlatformTakeIsACommissionMismatch(): void
    {
        $this->fx->completeSale();

        $report = $this->reconcile([$this->line($this->fx->orderId, self::GROSS, '9.99')]);

        $this->assertSame('commission_mismatch', $report->discrepancies[0]['kind']);
        $this->assertSame($this->fx->orderId, $report->discrepancies[0]['order_id']);
    }

    public function testAWrongGrossIsAGrossMismatch(): void
    {
        $this->fx->completeSale();

        $report = $this->reconcile([$this->line($this->fx->orderId, '1299.01')]);

        $this->assertSame('gross_mismatch', $report->discrepancies[0]['kind']);
    }

    public function testMoneySettledBeforeTheOrderCompletedIsReported(): void
    {
        // Paid, but the handover never happened, so the seller's money is still held.
        // A settlement line paying it out is the provider releasing escrow we did not.
        $this->fx->capture();

        $report = $this->reconcile([$this->line($this->fx->orderId)]);

        $this->assertSame('settled_before_completion', $report->discrepancies[0]['kind']);
        $this->assertStringContains('PAID', $report->discrepancies[0]['expected']);
    }

    public function testAPaidButUnfinishedOrderIsNotClaimedAsUnsettled(): void
    {
        // The other half of the same rule: an order sitting in escrow is owed nothing
        // by the file. Flagging it would bury the real findings in noise, and a daily
        // job that cries wolf is a daily job nobody reads.
        $this->fx->capture();

        $report = $this->reconcile([]);

        $this->assertTrue($report->isClean(), implode(' | ', $report->summaryLines()));
        $this->assertSame(0, $report->ledgerOrdersChecked);
    }

    public function testTheSameSaleSettledTwiceIsCaught(): void
    {
        $this->fx->completeSale();
        $line = $this->line($this->fx->orderId);

        // Two identical rows is what a provider re-sending yesterday's file looks
        // like. Checked row by row, each one matches the ledger and both pass;
        // summed per order, the file claims twice the money the sale earned.
        $report = $this->reconcile([$line, $this->line($this->fx->orderId)]);

        $this->assertFalse($report->isClean());
        $this->assertSame('gross_mismatch', $report->discrepancies[0]['kind']);
        $this->assertSame('commission_mismatch', $report->discrepancies[1]['kind']);
        $this->assertSame(2, $report->linesChecked, 'both rows were read');
    }

    public function testASaleAndItsRefundInTheSameFileNetToZero(): void
    {
        $this->fx->capture();
        [$tokenId, $pin] = $this->fx->scheduledHandover();
        $this->fx->kernel->confirmHandover->handle($tokenId, 'buyer', $pin, MoneyFixture::BUYER);
        $this->fx->kernel->initiateRefund->handle($this->fx->orderId, 'goods not as described');
        $this->fx->kernel->settleRefund->handle($this->fx->orderId, 'goods not as described');

        // The refund arrives as its own row with the signs reversed. Per order, the
        // file then says the platform took nothing and paid nothing — which is what
        // the ledger says too.
        $report = $this->reconcile([
            $this->line($this->fx->orderId),
            $this->line($this->fx->orderId, '-1299.00', '-90.93', '-1208.07'),
        ]);

        $this->assertTrue($report->isClean(), implode(' | ', $report->summaryLines()));
        $this->assertSame(2, $report->linesChecked);
    }

    public function testADiscrepancyIsAListItemUntilAHumanClosesIt(): void
    {
        $this->fx->completeSale();

        $report = $this->reconcile([$this->line($this->fx->orderId, '1299.01')]);

        // Nothing adjusted the ledger. A provider's bad row becomes a finding, never
        // an automatic write, or their error becomes our book.
        $this->assertSame(120807, $this->fx->kernel->sellerBalance(MoneyFixture::SELLER)->cents);
        $this->assertStringContains(
            'gross_mismatch — ' . $this->fx->orderId . ': ledger',
            $report->summaryLines()[0],
        );
    }

    private function reconcile(array $lines): ReconciliationReport
    {
        return $this->fx->kernel->reconcile->reconcile($lines);
    }

    private function line(string $orderId, string $gross = self::GROSS, ?string $take = null, ?string $net = null): SettlementLine
    {
        $grossMoney = Money::fromRand($gross);
        $takeMoney = Money::fromRand($take ?? self::TAKE);

        return new SettlementLine(
            $orderId,
            $grossMoney,
            $takeMoney,
            $net === null ? $grossMoney->subtract($takeMoney) : Money::fromRand($net),
        );
    }
}
