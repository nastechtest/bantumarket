<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;
use NasTech\Reporting\Projection\DisputeProjector;

/**
 * How decided disputes were decided.
 *
 * Open cases are not an outcome. Counting them as one would make the mix move
 * whenever a case sat unresolved, which is precisely the quarter an operator
 * would want to blame the process rather than the cases.
 */
final class DisputeOutcomeMix extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::DisputeOutcomeMix;
    }

    public function description(): string
    {
        return 'Decided disputes by outcome, with each outcome\'s share.';
    }

    public function laggingSources(): array
    {
        return ['dispute_facts (DisputeOpened, DisputeDecided)'];
    }

    public function columns(): array
    {
        return ['outcome' => 'string', 'decided' => 'integer', 'share_bps' => 'bps'];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $counts = array_fill_keys(DisputeProjector::OUTCOMES, 0);
        $total = 0;
        foreach ($this->facts('dispute_facts', $snapshot, 'decided_at', 'decided_ingested_at') as $row) {
            $outcome = (string) $row['outcome'];
            if (!array_key_exists($outcome, $counts)) {
                continue;
            }
            $counts[$outcome]++;
            $total++;
        }

        $rows = [];
        foreach ($counts as $outcome => $count) {
            $rows[] = [
                'outcome' => $outcome,
                'decided' => $count,
                'share_bps' => $this->bps($count, $total),
            ];
        }

        return $rows;
    }
}
