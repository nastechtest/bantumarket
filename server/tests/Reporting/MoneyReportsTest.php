<?php

declare(strict_types=1);

namespace NasTech\Tests\Reporting;

use NasTech\Reporting\ReportName;
use NasTech\Tests\TestCase;

/**
 * Money reports are reconciled against evidence, not derived from prices.
 *
 * The refunded-sale fixture is the contra test: a forward commission and its
 * reversal must net to the ledger, and the report must get there by reading the
 * two evidence rows. If CommissionAccrued ever summed order prices, the refund
 * would be counted twice or not at all and the delta would expose it.
 */
final class MoneyReportsTest extends TestCase
{
    private ReportingFixture $fx;

    public function setUp(): void
    {
        $this->fx = new ReportingFixture();
        $this->fx->emit('SellerOnboarded', [
            'seller_id' => ReportingFixture::SELLER,
            'city' => 'Cape Town',
            'cohort_week' => '2026-W44',
            'pilot_capture' => true,
        ], '2026-10-27T08:00:00+00:00');
        $this->fx->completedSale('ord_kept', 50_000, 3_500, '2026-11-02T10:00:00+00:00', '2026-11-02T10:01:00+00:00');
        $this->fx->completedSale('ord_refunded', 100_000, 7_000, '2026-11-03T10:00:00+00:00', '2026-11-03T10:01:00+00:00');
        $this->fx->refund('ord_refunded', 100_000, 7_000);

        // One released payout line and the ledger row that paid it.
        $this->fx->emit('PayoutBatchReleased', [
            'batch_id' => 'bat_1',
            'currency' => 'ZAR',
            'lines' => [[
                'seller_id' => ReportingFixture::SELLER,
                'amount_cents' => 10_000,
                'oldest_payable_at' => '2026-11-01T12:00:00+00:00',
            ]],
        ], '2026-11-03T12:00:00+00:00', '2026-11-03T12:01:00+00:00');
        $this->fx->emit('LedgerEntryRecorded', [
            'entry_id' => 'led_payout_1',
            'seller_id' => ReportingFixture::SELLER,
            'entry_type' => 'PAYOUT',
            'amount_cents' => -10_000,
            'currency' => 'ZAR',
        ], '2026-11-03T12:00:00+00:00', '2026-11-03T12:01:00+00:00');
    }

    public function testGmvCountsCompletedOrdersAndShowsRefundsSeparately(): void
    {
        $row = $this->fx->rows(ReportName::Gmv)[0];

        $this->assertSame('ZAR', $row['currency']);
        $this->assertSame(2, $row['completed_orders']);
        $this->assertSame(150_000, $row['gmv_cents'], 'GMV is the two completed sales, gross');
        $this->assertSame(100_000, $row['refunded_cents']);
        $this->assertSame(50_000, $row['net_gmv_cents']);
    }

    public function testCommissionAccruedHandlesTheContraAndReconcilesToTheLedger(): void
    {
        $row = $this->fx->rows(ReportName::CommissionAccrued)[0];

        $this->assertSame(10_500, $row['forward_cents']);
        $this->assertSame(7_000, $row['reversal_cents']);
        $this->assertSame(3_500, $row['net_cents']);
        $this->assertSame(3_500, $row['ledger_net_cents'], 'commission debits net of the reversal credit');
        $this->assertSame(0, $row['delta_cents'], 'the projection and the ledger must agree to the cent');
    }

    public function testAOneCentLedgerDisagreementIsVisibleAndNotAdjusted(): void
    {
        $this->fx->emit('LedgerEntryRecorded', [
            'entry_id' => 'led_commission_wrong',
            'seller_id' => ReportingFixture::SELLER,
            'order_id' => 'ord_kept',
            'entry_type' => 'COMMISSION_REVERSAL',
            'amount_cents' => 1,
            'currency' => 'ZAR',
            'reversal_of' => 'led_ord_kept',
        ], '2026-11-04T10:00:00+00:00');

        $row = $this->fx->rows(ReportName::CommissionAccrued)[0];
        $this->assertSame(3_499, $row['ledger_net_cents']);
        $this->assertSame(1, $row['delta_cents'], 'one cent out is still a reconciliation failure');

        $reconciliation = $this->fx->rows(ReportName::SettlementReconciliation)[0];
        $this->assertSame(1, $reconciliation['commission_delta_cents']);
    }

    public function testTakeRateUsesNetGmvAndNetCommission(): void
    {
        $row = $this->fx->rows(ReportName::TakeRate)[0];

        $this->assertSame(50_000, $row['net_gmv_cents']);
        $this->assertSame(3_500, $row['commission_net_cents']);
        $this->assertSame(700, $row['take_rate_bps'], '3500 / 50000 is 700 basis points');
    }

    public function testSettlementReconciliationMatchesPayoutsToTheLedger(): void
    {
        $row = $this->fx->rows(ReportName::SettlementReconciliation)[0];

        $this->assertSame(10_000, $row['ledger_payout_cents']);
        $this->assertSame(10_000, $row['released_cents']);
        $this->assertSame(0, $row['payout_delta_cents']);
        $this->assertSame(0, $row['commission_delta_cents']);
    }

    public function testAOneCentPayoutMismatchIsNotSmoothedAway(): void
    {
        $this->fx->emit('LedgerEntryRecorded', [
            'entry_id' => 'led_payout_short',
            'seller_id' => ReportingFixture::SELLER,
            'entry_type' => 'PAYOUT',
            'amount_cents' => -1,
            'currency' => 'ZAR',
        ], '2026-11-03T12:30:00+00:00');

        $row = $this->fx->rows(ReportName::SettlementReconciliation)[0];
        $this->assertSame(10_001, $row['ledger_payout_cents']);
        $this->assertSame(-1, $row['payout_delta_cents'], 'released more than the ledger says was paid');
    }

    public function testPayoutLatencyIsMeasuredPerReleasedSellerLine(): void
    {
        $row = $this->fx->rows(ReportName::PayoutLatency)[0];

        $this->assertSame(1, $row['payouts']);
        $this->assertSame(10_000, $row['amount_cents']);
        $this->assertSame(172_800, $row['avg_latency_seconds'], 'two days from payable to release');
        $this->assertSame(172_800, $row['max_latency_seconds']);
    }

    public function testADeadPayoutLineIsNotCountedAsReleasedMoney(): void
    {
        $this->fx->emit('PayoutBatchDead', [
            'batch_id' => 'bat_dead',
            'currency' => 'ZAR',
            'lines' => [[
                'seller_id' => ReportingFixture::SELLER,
                'amount_cents' => 99_999,
                'oldest_payable_at' => '2026-11-01T00:00:00+00:00',
            ]],
        ], '2026-11-06T10:00:00+00:00');

        $latency = $this->fx->rows(ReportName::PayoutLatency)[0];
        $this->assertSame(1, $latency['payouts']);
        $this->assertSame(10_000, $latency['amount_cents']);

        $reconciliation = $this->fx->rows(ReportName::SettlementReconciliation)[0];
        $this->assertSame(10_000, $reconciliation['released_cents'], 'a dead attempt returned to payable, not paid');
    }

    public function testEveryMoneyReportStatesItsLaggingSources(): void
    {
        foreach ([ReportName::Gmv, ReportName::CommissionAccrued, ReportName::SettlementReconciliation] as $name) {
            $result = $this->fx->run($name);
            $this->assertTrue($result->laggingSources !== [], $name->value . ' must state which sources can lag');
            $this->assertTrue($result->asOf !== '', $name->value . ' must state an as-of');
        }
    }
}
