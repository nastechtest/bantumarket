<?php

declare(strict_types=1);

namespace NasTech\Tests\Reporting;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;
use NasTech\Tests\TestCase;

/**
 * A report is a projection with a stated as-of.
 *
 * The load-bearing test here is the late sale. It occurred before the first
 * snapshot's as-of but was ingested after it closed. The old report must not
 * change — not even by one order — and a new report must include it under a new
 * as-of. Silently mixing the two would mean a number sent to finance could
 * change without a new artefact saying so.
 */
final class SnapshotTest extends TestCase
{
    public function testALateEventIsExcludedFromTheOldSnapshotAndIncludedInANewOne(): void
    {
        $fx = new ReportingFixture('2026-11-10T09:00:00+00:00');
        $fx->completedSale('ord_early', 100_000, 7_000, '2026-11-10T08:00:00+00:00', '2026-11-10T08:01:00+00:00');

        $old = $fx->snapshot();
        $oldResult = $fx->run(ReportName::Gmv, $old);
        $this->assertCount(1, $oldResult->rows);
        $this->assertSame(100_000, $oldResult->rows[0]['gmv_cents']);
        $this->assertSame('2026-11-10T09:00:00+00:00', $oldResult->asOf);
        $this->assertSame('2026-11-10T08:01:00+00:00', $oldResult->ingestedThrough);

        // The sale happened at 08:30 — before the old as-of — but we heard about
        // it at 10:00, after the old snapshot had closed.
        $fx->advance('PT1H2M');
        $fx->completedSale('ord_late', 50_000, 3_500, '2026-11-10T08:30:00+00:00', '2026-11-10T10:00:00+00:00');

        $replayed = $fx->run(ReportName::Gmv, $old);
        $this->assertSame($oldResult->rows, $replayed->rows, 'an old snapshot must reproduce even after a late event');
        $this->assertSame($oldResult->asOf, $replayed->asOf);
        $this->assertSame($oldResult->ingestedThrough, $replayed->ingestedThrough);

        $fresh = $fx->snapshot();
        $this->assertNotSame($old->id, $fresh->id);
        $this->assertTrue($fresh->asOf > $old->asOf, 'the new snapshot must state a later as-of');
        $this->assertTrue($fresh->ingestedThrough > $old->ingestedThrough, 'the new watermark must show the late ingestion');

        $newResult = $fx->run(ReportName::Gmv, $fresh);
        $this->assertSame(150_000, $newResult->rows[0]['gmv_cents']);
        $this->assertSame(2, $newResult->rows[0]['completed_orders']);
        $this->assertNotSame($old->asOfIso(), $newResult->asOf);
    }

    public function testARefundIngestedLateChangesOnlyTheNewSnapshot(): void
    {
        $fx = new ReportingFixture('2026-11-10T09:00:00+00:00');
        $fx->completedSale('ord_1', 100_000, 7_000, '2026-11-09T10:00:00+00:00', '2026-11-09T10:01:00+00:00');

        $old = $fx->snapshot();
        $this->assertSame(0, $fx->rows(ReportName::Gmv, $old)[0]['refunded_cents']);

        $fx->advance('PT2H');
        $fx->refund('ord_1', 100_000, 7_000, '2026-11-09T12:00:00+00:00', '2026-11-10T11:00:00+00:00');

        $this->assertSame(0, $fx->rows(ReportName::Gmv, $old)[0]['refunded_cents']);

        $fresh = $fx->snapshot();
        $row = $fx->rows(ReportName::Gmv, $fresh)[0];
        $this->assertSame(100_000, $row['refunded_cents']);
        $this->assertSame(0, $row['net_gmv_cents']);
        $this->assertSame(0, $fx->rows(ReportName::CommissionAccrued, $fresh)[0]['delta_cents']);
    }

    public function testASnapshotCannotClaimKnowledgeFromAfterItClosed(): void
    {
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => new ReportSnapshot(
                'rpt_impossible',
                new \DateTimeImmutable('2026-11-10T09:00:00+00:00'),
                new \DateTimeImmutable('2026-11-10T10:00:00+00:00'),
                new \DateTimeImmutable('2026-11-10T09:30:00+00:00'),
            ),
            'cannot know about an event ingested after it closed',
        );
    }

    public function testTheRunnerRecordsEveryRunAgainstTheSnapshotItUsed(): void
    {
        $fx = new ReportingFixture();
        $snapshot = $fx->snapshot();
        $fx->run(ReportName::Gmv, $snapshot);
        $fx->run(ReportName::SearchZeroResults, $snapshot);

        $runs = $fx->store->all('report_runs');
        $this->assertCount(2, $runs);
        $this->assertSame($snapshot->id, $runs[0]['snapshot_id']);
        $this->assertSame($snapshot->id, $runs[1]['snapshot_id']);
    }

    public function testARowLimitTruncatesAndTheRunSaysSo(): void
    {
        $fx = new ReportingFixture();
        foreach (['electronics', 'furniture', 'books'] as $i => $category) {
            $fx->emit('ListingCreated', [
                'listing_id' => 'lst_' . $i,
                'seller_id' => ReportingFixture::SELLER,
                'category_id' => $category,
                'city' => 'Cape Town',
            ], sprintf('2026-11-0%dT08:00:00+00:00', $i + 1));
        }

        $result = $fx->run(ReportName::ListingsCreated, null, 2);
        $this->assertTrue($result->truncated);
        $this->assertCount(2, $result->rows);
        $this->assertSame(2, $fx->store->all('report_runs')[0]['row_count']);
        $this->assertSame(true, $fx->store->all('report_runs')[0]['truncated']);
    }

    public function testARowLimitAboveTheHardCeilingIsRefusedRatherThanServed(): void
    {
        $fx = new ReportingFixture();

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $fx->run(ReportName::Gmv, null, 10_001),
            'hard ceiling',
        );
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $fx->run(ReportName::Gmv, null, 0),
            'at least one',
        );
    }

    public function testTheSnapshotRepositoryKeepsHistoryInClosingOrder(): void
    {
        $fx = new ReportingFixture('2026-11-10T09:00:00+00:00');
        $first = $fx->snapshot();
        $fx->advance('PT30M');
        $second = $fx->snapshot();

        $this->assertSame($second->id, $fx->runner->recentSnapshots(1)[0]->id);
        $this->assertSame($second->id, $fx->runner->findSnapshot($second->id)?->id);
        $this->assertSame(null, $fx->runner->findSnapshot('rpt_nope'));
        $this->assertSame($first->id, $fx->runner->recentSnapshots(2)[1]->id);
    }
}
