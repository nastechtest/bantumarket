<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * Inspection -> purchase conversion, including the path with no 3D view.
 *
 * A view converts when a completed order for the same session and listing
 * exists inside the snapshot. Counts are reported for all views, 3D views and
 * non-3D views; the last column is the one that proves the metric does not
 * depend on the scene runtime.
 */
final class InspectionToPurchase extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::InspectionToPurchase;
    }

    public function description(): string
    {
        return 'Purchases attributed to an inspection view, split by 3D use.';
    }

    public function laggingSources(): array
    {
        return ['inspection_facts (ListingViewed)', 'order_facts (OrderCompleted)'];
    }

    public function columns(): array
    {
        return [
            'views' => 'integer',
            'purchases' => 'integer',
            'conversion_bps' => 'bps',
            'views_3d' => 'integer',
            'purchases_3d' => 'integer',
            'conversion_3d_bps' => 'bps',
            'views_without_3d' => 'integer',
            'purchases_without_3d' => 'integer',
            'conversion_without_3d_bps' => 'bps',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $purchased = [];
        foreach ($this->facts('order_facts', $snapshot, 'completed_at', 'completed_ingested_at') as $row) {
            $session = $row['viewer_session_id'] ?? null;
            if (!is_string($session) || $session === '') {
                continue;
            }
            $purchased[$session . '|' . (string) ($row['listing_id'] ?? '')] = true;
        }

        $totals = ['views' => 0, 'purchases' => 0, 'views_3d' => 0, 'purchases_3d' => 0, 'views_non' => 0, 'purchases_non' => 0];
        foreach ($this->facts('inspection_facts', $snapshot, 'viewed_at', 'ingested_at') as $row) {
            $key = (string) $row['session_id'] . '|' . (string) $row['listing_id'];
            $converted = isset($purchased[$key]);
            $totals['views']++;
            $totals['purchases'] += $converted ? 1 : 0;
            if ((bool) $row['used_3d']) {
                $totals['views_3d']++;
                $totals['purchases_3d'] += $converted ? 1 : 0;
            } else {
                $totals['views_non']++;
                $totals['purchases_non'] += $converted ? 1 : 0;
            }
        }

        return [[
            'views' => $totals['views'],
            'purchases' => $totals['purchases'],
            'conversion_bps' => $this->bps($totals['purchases'], $totals['views']),
            'views_3d' => $totals['views_3d'],
            'purchases_3d' => $totals['purchases_3d'],
            'conversion_3d_bps' => $this->bps($totals['purchases_3d'], $totals['views_3d']),
            'views_without_3d' => $totals['views_non'],
            'purchases_without_3d' => $totals['purchases_non'],
            'conversion_without_3d_bps' => $this->bps($totals['purchases_non'], $totals['views_non']),
        ]];
    }
}
