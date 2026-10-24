<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * The cohort table, joined to the outcomes the exit tests compare.
 *
 * Seller, city, week and whether the pilot capture programme applied at
 * onboarding: the design written down once. Every metric is filtered by its own
 * event pair inside the snapshot, so a cohort row added by a late onboarding
 * event changes a new snapshot and not an old one.
 */
final class SellerCohorts extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::SellerCohorts;
    }

    public function description(): string
    {
        return 'Seller cohorts (week, city, pilot capture) with listings, GMV and commission.';
    }

    public function laggingSources(): array
    {
        return ['seller_cohorts', 'listing_facts', 'order_facts', 'commission_facts'];
    }

    public function columns(): array
    {
        return [
            'cohort_week' => 'string',
            'city' => 'string',
            'pilot_capture' => 'boolean',
            'sellers' => 'integer',
            'listings' => 'integer',
            'gmv_cents' => 'cents',
            'commission_cents' => 'cents',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $cohorts = [];
        foreach ($this->facts('seller_cohorts', $snapshot, 'joined_at', 'ingested_at') as $row) {
            $key = (string) $row['cohort_week'] . '|' . (string) $row['city'] . '|' . (int) (bool) $row['pilot_capture'];
            if (!isset($cohorts[$key])) {
                $cohorts[$key] = [
                    'cohort_week' => (string) $row['cohort_week'],
                    'city' => (string) $row['city'],
                    'pilot_capture' => (bool) $row['pilot_capture'],
                    'sellers' => 0,
                    'listings' => 0,
                    'gmv' => 0,
                    'commission' => 0,
                    'seller_ids' => [],
                ];
            }
            $cohorts[$key]['sellers']++;
            $cohorts[$key]['seller_ids'][(string) $row['seller_id']] = true;
        }

        $sellerKey = [];
        foreach ($cohorts as $key => $cohort) {
            foreach ($cohort['seller_ids'] as $sellerId => $_) {
                $sellerKey[$sellerId] = $key;
            }
        }

        foreach ($this->facts('listing_facts', $snapshot, 'created_at', 'created_ingested_at') as $row) {
            $key = $sellerKey[(string) $row['seller_id']] ?? null;
            if ($key !== null) {
                $cohorts[$key]['listings']++;
            }
        }

        foreach ($this->facts('order_facts', $snapshot, 'completed_at', 'completed_ingested_at') as $row) {
            $key = $sellerKey[(string) $row['seller_id']] ?? null;
            if ($key !== null) {
                $cohorts[$key]['gmv'] += (int) $row['gross_cents'];
            }
        }

        foreach ($this->facts('commission_facts', $snapshot) as $row) {
            $key = $sellerKey[(string) $row['seller_id']] ?? null;
            if ($key !== null) {
                $cohorts[$key]['commission'] += (int) $row['amount_cents'];
            }
        }

        $rows = [];
        foreach ($cohorts as $cohort) {
            $rows[] = [
                'cohort_week' => $cohort['cohort_week'],
                'city' => $cohort['city'],
                'pilot_capture' => $cohort['pilot_capture'],
                'sellers' => $cohort['sellers'],
                'listings' => $cohort['listings'],
                'gmv_cents' => $cohort['gmv'],
                'commission_cents' => $cohort['commission'],
            ];
        }
        usort($rows, static fn (array $a, array $b): int => [$a['cohort_week'], $a['city'], $a['pilot_capture']] <=> [$b['cohort_week'], $b['city'], $b['pilot_capture']]);

        return $rows;
    }
}
