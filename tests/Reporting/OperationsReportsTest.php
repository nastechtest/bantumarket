<?php

declare(strict_types=1);

namespace NasTech\Tests\Reporting;

use NasTech\Reporting\ReportName;
use NasTech\Tests\TestCase;

/**
 * Disputes, capture economics and inspection conversion.
 *
 * These reports share one design rule: a state that is not finished is not an
 * outcome. An open dispute is a dispute rate, never an outcome mix bucket; an
 * uncosted capture job is not a cost per item; and an inspection counts whether
 * or not the buyer used the 3D viewer.
 */
final class OperationsReportsTest extends TestCase
{
    private ReportingFixture $fx;

    public function setUp(): void
    {
        $this->fx = new ReportingFixture();
    }

    public function testDisputeRateUsesCompletedOrdersAsItsDenominator(): void
    {
        $this->fx->completedSale('ord_1', 100_000, 7_000, '2026-11-01T10:00:00+00:00');
        $this->fx->completedSale('ord_2', 80_000, 5_600, '2026-11-01T11:00:00+00:00');
        $this->fx->emit('DisputeOpened', [
            'case_id' => 'cas_1',
            'order_id' => 'ord_1',
            'kind' => 'ITEM_NOT_AS_DESCRIBED',
        ], '2026-11-02T09:00:00+00:00');
        $this->fx->emit('DisputeOpened', [
            'case_id' => 'cas_2',
            'order_id' => 'ord_2',
            'kind' => 'NOT_DELIVERED',
        ], '2026-11-02T10:00:00+00:00');

        $row = $this->fx->rows(ReportName::DisputeRate)[0];
        $this->assertSame(2, $row['completed_orders']);
        $this->assertSame(2, $row['disputes_opened']);
        $this->assertSame(10_000, $row['dispute_rate_bps']);
    }

    public function testAnOpenDisputeIsNotCountedInTheOutcomeMix(): void
    {
        $this->fx->emit('DisputeOpened', ['case_id' => 'cas_1', 'order_id' => 'ord_1', 'kind' => 'ITEM_NOT_AS_DESCRIBED'], '2026-11-02T09:00:00+00:00');
        $this->fx->emit('DisputeOpened', ['case_id' => 'cas_2', 'order_id' => 'ord_2', 'kind' => 'NOT_DELIVERED'], '2026-11-02T10:00:00+00:00');
        $this->fx->emit('DisputeDecided', ['case_id' => 'cas_1', 'outcome' => 'BUYER_FAVOUR'], '2026-11-03T09:00:00+00:00');

        $rows = $this->fx->rows(ReportName::DisputeOutcomeMix);
        $byOutcome = [];
        foreach ($rows as $row) {
            $byOutcome[$row['outcome']] = $row;
        }

        $this->assertCount(4, $byOutcome, 'every contracted outcome is present, even at zero');
        $this->assertSame('BUYER_FAVOUR', $byOutcome['BUYER_FAVOUR']['outcome']);
        $this->assertSame(1, $byOutcome['BUYER_FAVOUR']['decided']);
        $this->assertSame(10_000, $byOutcome['BUYER_FAVOUR']['share_bps']);
        $this->assertSame(0, $byOutcome['SELLER_FAVOUR']['decided']);
        $this->assertSame(0, $byOutcome['SPLIT']['decided']);
        $this->assertSame(0, $byOutcome['WITHDRAWN']['decided'], 'the open case must not appear as an outcome');
    }

    public function testAnOutcomeOutsideTheContractIsRefused(): void
    {
        $this->fx->emit('DisputeOpened', ['case_id' => 'cas_1', 'order_id' => 'ord_1', 'kind' => 'NOT_DELIVERED'], '2026-11-02T09:00:00+00:00');

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $this->fx->emit('DisputeDecided', ['case_id' => 'cas_1', 'outcome' => 'COIN_TOSS'], '2026-11-03T09:00:00+00:00'),
            'not in the contract',
        );
    }

    public function testCaptureJobsAreCountedByTheirCurrentState(): void
    {
        $this->fx->emit('CaptureJobStateChanged', ['job_id' => 'job_1', 'item_id' => 'itm_1', 'state' => 'intake'], '2026-11-01T08:00:00+00:00');
        $this->fx->emit('CaptureJobStateChanged', ['job_id' => 'job_1', 'item_id' => 'itm_1', 'state' => 'captured'], '2026-11-01T09:00:00+00:00');
        $this->fx->emit('CaptureJobCompleted', ['job_id' => 'job_1', 'item_id' => 'itm_1', 'state' => 'published', 'cost_cents' => 25_000], '2026-11-01T10:00:00+00:00');
        $this->fx->emit('CaptureJobCompleted', ['job_id' => 'job_2', 'item_id' => 'itm_2', 'state' => 'published', 'cost_cents' => 29_000], '2026-11-01T11:00:00+00:00');
        $this->fx->emit('CaptureJobStateChanged', ['job_id' => 'job_3', 'item_id' => 'itm_3', 'state' => 'failed'], '2026-11-01T12:00:00+00:00');

        $rows = $this->fx->rows(ReportName::CaptureJobsByState);
        $byState = [];
        foreach ($rows as $row) {
            $byState[$row['state']] = $row['jobs'];
        }

        $this->assertSame(2, $byState['published'], 'intake and captured were lifecycle steps, not states of two jobs');
        $this->assertSame(1, $byState['failed']);
    }

    public function testCaptureCostPerItemComparesToTheStatedAssumption(): void
    {
        $this->fx->emit('CaptureJobCompleted', ['job_id' => 'job_1', 'item_id' => 'itm_1', 'cost_cents' => 25_000], '2026-11-01T10:00:00+00:00');
        $this->fx->emit('CaptureJobCompleted', ['job_id' => 'job_2', 'item_id' => 'itm_2', 'cost_cents' => 29_000], '2026-11-01T11:00:00+00:00');
        $this->fx->emit('CaptureJobCompleted', ['job_id' => 'job_3', 'item_id' => 'itm_3', 'cost_cents' => 40_000], '2026-11-01T12:00:00+00:00');

        $row = $this->fx->rows(ReportName::CaptureCostPerItem)[0];
        $this->assertSame(3, $row['completed_items']);
        $this->assertSame(94_000, $row['total_cost_cents']);
        $this->assertSame(31_333, $row['cost_per_item_cents']);
        $this->assertSame(27_000, $row['assumption_cents']);
        $this->assertSame(4_333, $row['variance_cents']);
        $this->assertFalse($row['within_assumption']);
    }

    public function testAnUncostedJobIsNotAPublishedItem(): void
    {
        $this->fx->emit('CaptureJobStateChanged', ['job_id' => 'job_1', 'item_id' => 'itm_1', 'state' => 'published'], '2026-11-01T10:00:00+00:00');

        $row = $this->fx->rows(ReportName::CaptureCostPerItem)[0];
        $this->assertSame(0, $row['completed_items']);
        $this->assertSame(0, $row['total_cost_cents']);
        $this->assertFalse($row['within_assumption']);
    }

    public function testInspectionConversionCountsTheNonThreeDimensionalPath(): void
    {
        // A completed order for the session that inspected lst_1, plus a view
        // with and without 3D. Both views must convert.
        $this->fx->emit('PaymentRecorded', [
            'order_id' => 'ord_conv',
            'seller_id' => ReportingFixture::SELLER,
            'listing_id' => 'lst_1',
            'viewer_session_id' => 'vis_1',
            'gross' => '500.00',
            'currency' => 'ZAR',
        ], '2026-11-02T12:00:00+00:00');
        $this->fx->emit('OrderCompleted', ['order_id' => 'ord_conv'], '2026-11-02T12:01:00+00:00');

        $this->fx->emit('ListingViewed', ['view_id' => 'viw_1', 'listing_id' => 'lst_1', 'session_id' => 'vis_1', 'used_3d' => true], '2026-11-02T10:00:00+00:00');
        $this->fx->emit('ListingViewed', ['view_id' => 'viw_2', 'listing_id' => 'lst_1', 'session_id' => 'vis_1', 'used_3d' => false], '2026-11-02T10:05:00+00:00');
        $this->fx->emit('ListingViewed', ['view_id' => 'viw_3', 'listing_id' => 'lst_2', 'session_id' => 'vis_2', 'used_3d' => true], '2026-11-02T10:10:00+00:00');
        $this->fx->emit('ListingViewed', ['view_id' => 'viw_4', 'listing_id' => 'lst_1', 'session_id' => 'vis_3', 'used_3d' => false], '2026-11-02T10:15:00+00:00');

        $row = $this->fx->rows(ReportName::InspectionToPurchase)[0];
        $this->assertSame(4, $row['views']);
        $this->assertSame(2, $row['purchases']);
        $this->assertSame(5_000, $row['conversion_bps']);
        $this->assertSame(2, $row['views_3d']);
        $this->assertSame(1, $row['purchases_3d']);
        $this->assertSame(5_000, $row['conversion_3d_bps']);
        $this->assertSame(2, $row['views_without_3d']);
        $this->assertSame(1, $row['purchases_without_3d']);
        $this->assertSame(5_000, $row['conversion_without_3d_bps'], 'the non-3D path must carry equal weight');
    }

    public function testAnUnknownCaptureStateIsRefused(): void
    {
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $this->fx->emit('CaptureJobStateChanged', ['job_id' => 'job_1', 'item_id' => 'itm_1', 'state' => 'teleported'], '2026-11-01T10:00:00+00:00'),
            'not in the contract',
        );
    }
}
