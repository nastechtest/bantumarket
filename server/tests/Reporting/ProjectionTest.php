<?php

declare(strict_types=1);

namespace NasTech\Tests\Reporting;

use NasTech\Reporting\EventEnvelope;
use NasTech\Reporting\EventType;
use NasTech\Reporting\ProjectionWatermark;
use NasTech\Reporting\Schema;
use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;
use NasTech\Tests\TestCase;

/**
 * The projection is exactly-once, ordered and refuses money it cannot read.
 *
 * Each of these has a matching failure mode in production: a replayed event
 * double-counting a sale, a media event arriving before its listing silently
 * inventing one, and a JSON float being rounded into a report finance treats as
 * the ledger. The tests are negative because the positive path is the easy one.
 */
final class ProjectionTest extends TestCase
{
    public function testAReplayedEventIsClaimedOnceAndAppliedOnce(): void
    {
        $fx = new ReportingFixture();
        $event = new EventEnvelope(
            id: 'evt_dup',
            type: EventType::SEARCH_PERFORMED,
            aggregateId: 'qry_1',
            occurredAt: new \DateTimeImmutable('2026-11-01T08:00:00+00:00'),
            ingestedAt: new \DateTimeImmutable('2026-11-01T08:00:01+00:00'),
            payload: ['query_id' => 'qry_1', 'category_id' => 'electronics', 'result_count' => 3],
        );

        $this->assertSame('APPLIED', $fx->worker->apply($event));
        $this->assertSame('DUPLICATE', $fx->worker->apply($event), 'a second delivery must be found by event id');
        $this->assertCount(1, $fx->store->all('search_facts'));
        $this->assertSame(1, $fx->worker->watermark()->appliedEvents);
    }

    public function testAnEventWithNoProjectorIsRecordedAsIgnoredNotDropped(): void
    {
        $fx = new ReportingFixture();

        $this->assertSame('IGNORED', $fx->worker->apply(new EventEnvelope(
            id: 'evt_unknown',
            type: 'SomethingNobodyProjected',
            aggregateId: 'agg_1',
            occurredAt: new \DateTimeImmutable('2026-11-01T08:00:00+00:00'),
            ingestedAt: new \DateTimeImmutable('2026-11-01T08:00:01+00:00'),
            payload: [],
        )));

        $watermark = $fx->worker->watermark();
        $this->assertSame(0, $watermark->appliedEvents);
        $this->assertSame(1, $watermark->ignoredEvents);
        $this->assertSame('evt_unknown', $watermark->lastEventId);
        $this->assertSame('IGNORED', $fx->store->find('projected_events', 'evt_unknown')['outcome']);
    }

    public function testALiveEventBeforeItsCreationIsRefusedRatherThanInventingAListing(): void
    {
        $fx = new ReportingFixture();

        $this->assertThrows(
            \RuntimeException::class,
            fn () => $fx->emit(EventType::LISTING_WENT_LIVE, [
                'listing_id' => 'lst_ghost',
            ], '2026-11-01T09:00:00+00:00'),
            'before its ListingCreated',
        );
        $this->assertSame(null, $fx->store->find('listing_facts', 'lst_ghost'));
        $this->assertSame(null, $fx->worker->watermark()->lastEventId, 'a refused event must not advance the watermark');
    }

    public function testAFloatInAMoneyFieldIsRefused(): void
    {
        $fx = new ReportingFixture();

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $fx->emit(EventType::LEDGER_ENTRY_RECORDED, [
                'entry_id' => 'led_float',
                'seller_id' => ReportingFixture::SELLER,
                'entry_type' => 'SELLER_EARNINGS',
                'amount_cents' => 1299.0,
            ], '2026-11-01T10:00:00+00:00'),
            'no integer',
        );
        $this->assertSame([], $fx->store->all('ledger_facts'));
    }

    public function testAZeroLedgerRowCannotBeProjectedAsEvidence(): void
    {
        $fx = new ReportingFixture();

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $fx->emit(EventType::LEDGER_ENTRY_RECORDED, [
                'entry_id' => 'led_zero',
                'seller_id' => ReportingFixture::SELLER,
                'entry_type' => 'SELLER_EARNINGS',
                'amount_cents' => 0,
            ], '2026-11-01T10:00:00+00:00'),
            'zero-value ledger',
        );
    }

    public function testAnUnknownLedgerTypeIsRefused(): void
    {
        $fx = new ReportingFixture();

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $fx->emit(EventType::LEDGER_ENTRY_RECORDED, [
                'entry_id' => 'led_bad',
                'seller_id' => ReportingFixture::SELLER,
                'entry_type' => 'MYSTERY',
                'amount_cents' => 100,
            ], '2026-11-01T10:00:00+00:00'),
            'unknown entry type',
        );
    }

    public function testASignThatContradictsTheCommissionKindIsRefused(): void
    {
        $fx = new ReportingFixture();

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $fx->emit(EventType::COMMISSION_ENTRY_RECORDED, [
                'entry_id' => 'cmn_bad_forward',
                'order_id' => 'ord_1',
                'seller_id' => ReportingFixture::SELLER,
                'kind' => 'FORWARD',
                'amount_cents' => -100,
            ], '2026-11-01T10:00:00+00:00'),
            'forward commission cannot be negative',
        );

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $fx->emit(EventType::COMMISSION_ENTRY_RECORDED, [
                'entry_id' => 'cmn_bad_reversal',
                'order_id' => 'ord_1',
                'seller_id' => ReportingFixture::SELLER,
                'kind' => 'REVERSAL',
                'amount_cents' => 100,
            ], '2026-11-01T10:00:00+00:00'),
            'positive reversal',
        );
    }

    public function testANegativeSearchResultCountIsRefused(): void
    {
        $fx = new ReportingFixture();

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $fx->emit(EventType::SEARCH_PERFORMED, [
                'query_id' => 'qry_neg',
                'category_id' => 'electronics',
                'result_count' => -1,
            ], '2026-11-01T10:00:00+00:00'),
            'negative number of results',
        );
    }

    public function testASecondOnboardingForASellerFailsTheUniqueKeyNotTheDesign(): void
    {
        $fx = new ReportingFixture();
        $fx->emit(EventType::SELLER_ONBOARDED, [
            'seller_id' => ReportingFixture::SELLER,
            'city' => 'Cape Town',
            'cohort_week' => '2026-W44',
            'pilot_capture' => true,
        ], '2026-10-27T08:00:00+00:00');

        // A second event with a different id is a producer replay, not a
        // legitimate edit: the cohort written on the day must not be rewritten.
        $this->assertThrows(
            UniqueConstraintViolation::class,
            fn () => $fx->emit(EventType::SELLER_ONBOARDED, [
                'seller_id' => ReportingFixture::SELLER,
                'city' => 'Johannesburg',
                'cohort_week' => '2026-W45',
                'pilot_capture' => false,
            ], '2026-11-03T08:00:00+00:00'),
            'Unique violation',
        );

        $this->assertSame('Cape Town', $fx->store->find('seller_cohorts', ReportingFixture::SELLER)['city']);
    }

    public function testTheMissingEventReportNamesWhatTheProjectionHasNeverSeen(): void
    {
        $fx = new ReportingFixture();
        $fx->emit(EventType::SEARCH_PERFORMED, [
            'query_id' => 'qry_1',
            'category_id' => 'electronics',
            'result_count' => 0,
        ], '2026-11-01T08:00:00+00:00');

        $missing = $fx->worker->missingEventTypes([
            EventType::SEARCH_PERFORMED,
            EventType::LEDGER_ENTRY_RECORDED,
            EventType::COMMISSION_ENTRY_RECORDED,
        ]);

        $this->assertSame([EventType::LEDGER_ENTRY_RECORDED, EventType::COMMISSION_ENTRY_RECORDED], $missing);
    }

    public function testTheWatermarkStartsEmptyAndMovesWithBothClocks(): void
    {
        $fx = new ReportingFixture();
        $empty = $fx->worker->watermark();
        $this->assertSame(0, $empty->appliedEvents);
        $this->assertSame('1970-01-01T00:00:00+00:00', $empty->ingestedThrough()->format(\DateTimeInterface::ATOM));

        $fx->emit(
            EventType::SEARCH_PERFORMED,
            ['query_id' => 'qry_1', 'category_id' => 'electronics', 'result_count' => 1],
            '2026-11-01T08:00:00+00:00',
            '2026-11-03T09:30:00+00:00',
        );

        $watermark = $fx->worker->watermark();
        $this->assertSame('2026-11-01T08:00:00+00:00', $watermark->lastOccurredAt?->format(\DateTimeInterface::ATOM));
        $this->assertSame('2026-11-03T09:30:00+00:00', $watermark->lastIngestedAt?->format(\DateTimeInterface::ATOM));
    }

    public function testTheInMemoryStoreEnforcesTheSameAppendOnlyListAsTheMigration(): void
    {
        $schemas = [];
        $sql = (string) file_get_contents(dirname(__DIR__, 2) . '/db/migrations/013_reporting.sql');
        preg_match_all('/BEFORE UPDATE OR DELETE ON reporting\.([a-z_]+)/', $sql, $matches);
        foreach ($matches[1] as $table) {
            $schemas[] = $table;
        }
        sort($schemas);

        $expected = array_map(
            static fn (string $bare): string => substr(Schema::TABLES[$bare], strlen('reporting.')),
            Schema::APPEND_ONLY_TABLES,
        );
        sort($expected);

        $this->assertSame($expected, $schemas);
        $this->assertTrue(
            !in_array('listing_facts', $schemas, true),
            'listing_facts advances through its lifecycle and must stay mutable',
        );
    }

    public function testTheWatermarkRowIsTheOneTheSnapshotReads(): void
    {
        $fx = new ReportingFixture();
        $watermark = ProjectionWatermark::fromRow([
            'applied_events' => 2,
            'ignored_events' => 1,
            'last_occurred_at' => '2026-11-01T00:00:00+00:00',
            'last_ingested_at' => '2026-11-02T00:00:00+00:00',
            'last_event_id' => 'evt_2',
        ]);

        $this->assertSame(2, $watermark->appliedEvents);
        $this->assertSame('2026-11-01T00:00:00+00:00', $watermark->asOf()->format(\DateTimeInterface::ATOM));
        $this->assertSame('2026-11-02T00:00:00+00:00', $watermark->ingestedThrough()->format(\DateTimeInterface::ATOM));
    }
}
