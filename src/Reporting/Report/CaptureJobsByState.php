<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\Projection\CaptureProjector;
use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * Capture jobs by current state at the snapshot.
 *
 * The state is the last state event inside the snapshot, not the row's final
 * value; a job that moved from qc_human to published after the as-of belongs to
 * the earlier cohort. That is why the filter is on changed_at/changed_ingested_at
 * and not on the row's last write.
 */
final class CaptureJobsByState extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::CaptureJobsByState;
    }

    public function description(): string
    {
        return 'Capture jobs by the state they held at the snapshot.';
    }

    public function laggingSources(): array
    {
        return ['capture_facts (CaptureJobStateChanged, CaptureJobCompleted)'];
    }

    public function columns(): array
    {
        return ['state' => 'string', 'jobs' => 'integer'];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $counts = array_fill_keys(CaptureProjector::STATES, 0);
        foreach ($this->facts('capture_facts', $snapshot, 'changed_at', 'changed_ingested_at') as $row) {
            $state = (string) $row['state'];
            if (!array_key_exists($state, $counts)) {
                continue;
            }
            $counts[$state]++;
        }

        $rows = [];
        foreach ($counts as $state => $count) {
            $rows[] = ['state' => $state, 'jobs' => $count];
        }

        return $rows;
    }
}
