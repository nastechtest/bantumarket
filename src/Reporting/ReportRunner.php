<?php

declare(strict_types=1);

namespace NasTech\Reporting;

use NasTech\Reporting\Persistence\SnapshotRepository;
use NasTech\Reporting\Projection\ProjectionWorker;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Runs a report against a pinned snapshot and records the run.
 *
 * The snapshot is created here, not by the caller, because "the report I ran
 * this morning" must be reproducible: a later call with the same snapshot id
 * returns the same rows even after a late event lands. The run log records
 * which snapshot and whether the ceiling truncated the answer.
 */
final class ReportRunner
{
    public const ROW_CEILING = 1_000;

    public function __construct(
        private readonly Store $store,
        private readonly ReportCatalogue $catalogue,
        private readonly SnapshotRepository $snapshots,
        private readonly Clock $clock,
    ) {
    }

    public function snapshotNow(): ReportSnapshot
    {
        $row = $this->store->find('projection_state', 'reporting');
        $watermark = $row === null ? ProjectionWatermark::empty() : ProjectionWatermark::fromRow($row);

        $snapshot = ReportSnapshot::close(
            Id::generate('rpt')->value(),
            $this->clock->now(),
            $watermark->ingestedThrough(),
            $this->clock->now(),
        );
        $this->snapshots->save($snapshot);

        return $snapshot;
    }

    public function run(
        ReportName $name,
        ?ReportSnapshot $snapshot = null,
        int $limit = self::ROW_CEILING,
    ): ReportResult {
        $snapshot ??= $this->snapshotNow();
        if ($limit < 1) {
            throw new \InvalidArgumentException('A report row limit must be at least one');
        }
        if ($limit > self::ROW_CEILING * 10) {
            throw new \InvalidArgumentException(sprintf(
                'Report row limit %d exceeds the hard ceiling of %d; use the export path',
                $limit,
                self::ROW_CEILING * 10,
            ));
        }

        $report = $this->catalogue->get($name);
        $rows = $report->rowsFor($snapshot, $limit + 1);
        $truncated = count($rows) > $limit;
        if ($truncated) {
            $rows = array_slice($rows, 0, $limit);
        }

        $this->store->insert('report_runs', [
            'id' => Id::generate('rrn')->value(),
            'report_name' => $name->value,
            'snapshot_id' => $snapshot->id,
            'row_count' => count($rows),
            'truncated' => $truncated,
            'generated_at' => $this->clock->now()->format(\DateTimeInterface::ATOM),
        ]);

        return new ReportResult(
            report: $name,
            snapshotId: $snapshot->id,
            asOf: $snapshot->asOfIso(),
            ingestedThrough: $snapshot->ingestedThrough->format(\DateTimeInterface::ATOM),
            rows: $rows,
            laggingSources: $report->laggingSources(),
            truncated: $truncated,
        );
    }

    public function findSnapshot(string $id): ?ReportSnapshot
    {
        return $this->snapshots->find($id);
    }

    /**
     * @return list<ReportSnapshot>
     */
    public function recentSnapshots(int $limit = 20): array
    {
        return $this->snapshots->recent(max(0, $limit));
    }

    public function catalogue(): ReportCatalogue
    {
        return $this->catalogue;
    }
}
