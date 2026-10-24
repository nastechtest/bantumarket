<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * Time to first listing, by the cohort design written down at onboarding.
 *
 * The cohort table is the reason this number means anything: comparing sellers
 * onboarded under the pilot capture programme against those who were not is
 * only valid against the design recorded on the day they joined. A seller whose
 * city or pilot flag was edited later would silently move between cohorts.
 */
final class TimeToFirstListing extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::TimeToFirstListing;
    }

    public function description(): string
    {
        return 'Days from onboarding to first listing, by seller cohort.';
    }

    public function laggingSources(): array
    {
        return ['seller_cohorts (SellerOnboarded)', 'listing_facts (ListingCreated)'];
    }

    public function columns(): array
    {
        return [
            'cohort_week' => 'string',
            'city' => 'string',
            'pilot_capture' => 'boolean',
            'sellers' => 'integer',
            'sellers_with_listing' => 'integer',
            'avg_hours_to_first_listing' => 'integer',
            'first_listing_within_7_days_bps' => 'bps',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $firstListing = [];
        foreach ($this->facts('listing_facts', $snapshot, 'created_at', 'created_ingested_at') as $row) {
            $seller = (string) $row['seller_id'];
            $at = new \DateTimeImmutable((string) $row['created_at']);
            if (!isset($firstListing[$seller]) || $at < $firstListing[$seller]) {
                $firstListing[$seller] = $at;
            }
        }

        $buckets = [];
        foreach ($this->facts('seller_cohorts', $snapshot, 'joined_at', 'ingested_at') as $row) {
            $key = (string) $row['cohort_week'] . '|' . (string) $row['city'] . '|' . (int) (bool) $row['pilot_capture'];
            if (!isset($buckets[$key])) {
                $buckets[$key] = [
                    'cohort_week' => (string) $row['cohort_week'],
                    'city' => (string) $row['city'],
                    'pilot_capture' => (bool) $row['pilot_capture'],
                    'sellers' => 0,
                    'sellers_with_listing' => 0,
                    'hours_total' => 0,
                    'within_7_days' => 0,
                ];
            }
            $buckets[$key]['sellers']++;
            $joined = new \DateTimeImmutable((string) $row['joined_at']);
            $first = $firstListing[(string) $row['seller_id']] ?? null;
            if ($first === null) {
                continue;
            }
            $buckets[$key]['sellers_with_listing']++;
            $hours = intdiv($first->getTimestamp() - $joined->getTimestamp(), 3600);
            $buckets[$key]['hours_total'] += max(0, $hours);
            if ($hours <= 24 * 7) {
                $buckets[$key]['within_7_days']++;
            }
        }

        $rows = [];
        foreach ($buckets as $bucket) {
            $with = $bucket['sellers_with_listing'];
            $rows[] = [
                'cohort_week' => $bucket['cohort_week'],
                'city' => $bucket['city'],
                'pilot_capture' => $bucket['pilot_capture'],
                'sellers' => $bucket['sellers'],
                'sellers_with_listing' => $with,
                'avg_hours_to_first_listing' => $with === 0 ? 0 : intdiv($bucket['hours_total'] + intdiv($with, 2), $with),
                'first_listing_within_7_days_bps' => $this->bps($bucket['within_7_days'], $bucket['sellers']),
            ];
        }
        usort($rows, static fn (array $a, array $b): int => [$a['cohort_week'], $a['city'], $a['pilot_capture']] <=> [$b['cohort_week'], $b['city'], $b['pilot_capture']]);

        return $rows;
    }
}
