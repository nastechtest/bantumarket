<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\Projection\CaptureProjector;
use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * Capture cost per item against the ≈R270 assumption.
 *
 * The assumption is a constant, and the report states the variance instead of
 * deciding whether the programme is viable. That decision belongs to the exit
 * review; a report that coloured its own conclusion is how an assumption becomes
 * a target without anybody noticing.
 */
final class CaptureCostPerItem extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::CaptureCostPerItem;
    }

    public function description(): string
    {
        return 'Capture cost per completed item against the R270 assumption.';
    }

    public function laggingSources(): array
    {
        return ['capture_facts (CaptureJobCompleted)'];
    }

    public function columns(): array
    {
        return [
            'completed_items' => 'integer',
            'total_cost_cents' => 'cents',
            'cost_per_item_cents' => 'cents',
            'assumption_cents' => 'cents',
            'variance_cents' => 'cents',
            'within_assumption' => 'boolean',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $items = 0;
        $cost = 0;
        foreach ($this->facts('capture_facts', $snapshot, 'changed_at', 'changed_ingested_at') as $row) {
            if ($row['cost_cents'] === null || (string) $row['state'] !== 'published') {
                continue;
            }
            $items++;
            $cost += (int) $row['cost_cents'];
        }
        $perItem = $items === 0 ? 0 : intdiv($cost + intdiv($items, 2), $items);
        $assumption = CaptureProjector::ASSUMPTION_CENTS;

        return [[
            'completed_items' => $items,
            'total_cost_cents' => $cost,
            'cost_per_item_cents' => $perItem,
            'assumption_cents' => $assumption,
            'variance_cents' => $perItem - $assumption,
            'within_assumption' => $items > 0 && $perItem <= $assumption,
        ]];
    }
}
