<?php

declare(strict_types=1);

namespace NasTech\Tests\Reporting;

use NasTech\Reporting\ReportName;
use NasTech\Tests\TestCase;

/**
 * Supply-side reports: listings, cohorts and search demand.
 *
 * The pattern under test is that each side of a ratio is filtered by its own
 * event pair. A listing created before the as-of but live only after it must
 * count as created and not as converted, and a search that found nothing is
 * demand evidence, not a search failure.
 */
final class SupplyReportsTest extends TestCase
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
        ], '2026-10-26T08:00:00+00:00');

        $this->fx->emit('ListingCreated', [
            'listing_id' => 'lst_1',
            'seller_id' => ReportingFixture::SELLER,
            'category_id' => 'electronics',
            'city' => 'Cape Town',
        ], '2026-10-27T08:00:00+00:00');
        $this->fx->emit('ListingMediaAttached', [
            'listing_id' => 'lst_1',
        ], '2026-10-27T09:00:00+00:00');
        $this->fx->emit('ListingWentLive', [
            'listing_id' => 'lst_1',
        ], '2026-10-28T08:00:00+00:00');

        $this->fx->emit('ListingCreated', [
            'listing_id' => 'lst_2',
            'seller_id' => ReportingFixture::SELLER,
            'category_id' => 'electronics',
            'city' => 'Cape Town',
        ], '2026-10-30T08:00:00+00:00');

        $this->fx->emit('ListingCreated', [
            'listing_id' => 'lst_3',
            'seller_id' => 'sel_other',
            'category_id' => 'furniture',
            'city' => 'Durban',
        ], '2026-10-29T08:00:00+00:00');
        $this->fx->emit('ListingWentLive', [
            'listing_id' => 'lst_3',
        ], '2026-10-30T08:00:00+00:00');

        foreach ([['qry_1', 'electronics', 0], ['qry_2', 'electronics', 5], ['qry_3', 'books', 0]] as [$id, $category, $count]) {
            $this->fx->emit('SearchPerformed', [
                'query_id' => $id,
                'category_id' => $category,
                'result_count' => $count,
            ], '2026-10-31T08:00:00+00:00');
        }
    }

    public function testListingsCreatedCountsEventsByWeekAndCategory(): void
    {
        $rows = $this->fx->rows(ReportName::ListingsCreated);

        $this->assertCount(2, $rows);
        $this->assertSame('electronics', $rows[0]['category_id']);
        $this->assertSame(2, $rows[0]['listings_created']);
        $this->assertSame('2026-W44', $rows[0]['week']);
        $this->assertSame('furniture', $rows[1]['category_id']);
        $this->assertSame(1, $rows[1]['listings_created']);
    }

    public function testLiveListingsRequireMediaInsideTheSameSnapshot(): void
    {
        $row = $this->fx->rows(ReportName::ListingsLive)[0];

        $this->assertSame(2, $row['live_listings']);
        $this->assertSame(1, $row['live_with_media'], 'only lst_1 has a media event');
        $this->assertSame(5_000, $row['media_coverage_bps']);
    }

    public function testConversionCountsLiveAndCreatedSeparatelyByCategory(): void
    {
        $rows = $this->fx->rows(ReportName::ListingToLiveConversion);

        $this->assertSame('electronics', $rows[0]['category_id']);
        $this->assertSame(2, $rows[0]['created']);
        $this->assertSame(1, $rows[0]['live']);
        $this->assertSame(5_000, $rows[0]['conversion_bps']);

        $this->assertSame('furniture', $rows[1]['category_id']);
        $this->assertSame(1, $rows[1]['created']);
        $this->assertSame(1, $rows[1]['live']);
        $this->assertSame(10_000, $rows[1]['conversion_bps']);
    }

    public function testSearchZeroResultsSeparatesNoDemandFromNoCatalogue(): void
    {
        $rows = $this->fx->rows(ReportName::SearchZeroResults);

        $this->assertSame('books', $rows[0]['category_id']);
        $this->assertSame(1, $rows[0]['queries']);
        $this->assertSame(1, $rows[0]['zero_result_queries']);
        $this->assertSame(10_000, $rows[0]['zero_result_rate_bps']);

        $this->assertSame('electronics', $rows[1]['category_id']);
        $this->assertSame(2, $rows[1]['queries']);
        $this->assertSame(1, $rows[1]['zero_result_queries']);
        $this->assertSame(5_000, $rows[1]['zero_result_rate_bps']);
    }

    public function testTimeToFirstListingUsesTheCohortWrittenAtOnboarding(): void
    {
        $row = $this->fx->rows(ReportName::TimeToFirstListing)[0];

        $this->assertSame('2026-W44', $row['cohort_week']);
        $this->assertSame('Cape Town', $row['city']);
        $this->assertTrue($row['pilot_capture']);
        $this->assertSame(1, $row['sellers']);
        $this->assertSame(1, $row['sellers_with_listing']);
        $this->assertSame(24, $row['avg_hours_to_first_listing'], 'onboarded 08:00, first listing 24h later');
        $this->assertSame(10_000, $row['first_listing_within_7_days_bps']);
    }

    public function testTheCohortReportCountsOnlyListingsFromThatCohort(): void
    {
        $rows = $this->fx->rows(ReportName::SellerCohorts);

        $this->assertCount(1, $rows);
        $this->assertSame(1, $rows[0]['sellers']);
        $this->assertSame(2, $rows[0]['listings'], 'sel_other is not in this cohort');
        $this->assertSame(0, $rows[0]['gmv_cents']);
        $this->assertSame(0, $rows[0]['commission_cents']);
    }

    public function testALateListingIsAbsentFromTheOldSnapshotAndPresentInTheNewOne(): void
    {
        $old = $this->fx->snapshot();
        $before = $this->fx->rows(ReportName::ListingsCreated, $old)[0]['listings_created'];

        $this->fx->advance('PT1H');
        $this->fx->emit(
            'ListingCreated',
            [
                'listing_id' => 'lst_4',
                'seller_id' => ReportingFixture::SELLER,
                'category_id' => 'electronics',
                'city' => 'Cape Town',
            ],
            '2026-10-28T08:00:00+00:00',
            '2026-11-10T12:30:00+00:00',
        );

        $this->assertSame($before, $this->fx->rows(ReportName::ListingsCreated, $old)[0]['listings_created']);
        $fresh = $this->fx->snapshot();
        $this->assertSame($before + 1, $this->fx->rows(ReportName::ListingsCreated, $fresh)[0]['listings_created']);
    }
}
