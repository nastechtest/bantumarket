<?php

declare(strict_types=1);

namespace NasTech\Reporting\Export;

use NasTech\Reporting\Persistence\SnapshotRepository;
use NasTech\Reporting\ReportCatalogue;
use NasTech\Reporting\ReportName;

/**
 * Bounded CSV/JSON export: cursor paging, a hard row ceiling, and a mandatory
 * pinned snapshot.
 *
 * Why all three: a finance export is the artefact that leaves the building. An
 * unbounded one is a denial-of-service on the database; an unpinned one can
 * disagree with the report it claims to reproduce; an unsigned cursor lets a
 * client skip the rows it does not like. The permission to export is enforced
 * at the edge (capability `report.export`); this class returns a page, never a
 * decision about who may ask.
 */
final class ReportExport
{
    public const ROW_CEILING = 50_000;

    private readonly int $rowCeiling;

    public function __construct(
        private readonly ReportCatalogue $catalogue,
        private readonly SnapshotRepository $snapshots,
        private readonly ExportSerialiser $serialiser,
        private readonly string $cursorSecret,
        int $rowCeiling = self::ROW_CEILING,
    ) {
        if (strlen($cursorSecret) < 16) {
            throw new \InvalidArgumentException('Export cursor secret must be at least 16 bytes');
        }
        if ($rowCeiling < 1 || $rowCeiling > self::ROW_CEILING) {
            throw new \InvalidArgumentException(sprintf(
                'Export row ceiling must be between 1 and %d',
                self::ROW_CEILING,
            ));
        }
        $this->rowCeiling = $rowCeiling;
    }

    public function page(ExportRequest $request): ExportPage
    {
        $name = ReportName::tryFrom($request->report);
        if ($name === null) {
            throw new \InvalidArgumentException("Unknown report: {$request->report}");
        }
        $snapshot = $this->snapshots->find($request->snapshotId);
        if ($snapshot === null) {
            throw new InvalidExportCursor("Unknown snapshot {$request->snapshotId}; an export must name a closed snapshot");
        }

        $offset = 0;
        if ($request->cursor !== null) {
            $cursor = ExportCursor::parse($request->cursor, $this->cursorSecret);
            if ($cursor->report !== $request->report || $cursor->snapshotId !== $request->snapshotId) {
                throw new InvalidExportCursor('Export cursor belongs to a different report or snapshot');
            }
            $offset = $cursor->offset;
        }

        $report = $this->catalogue->get($name);
        $all = $report->rowsFor($snapshot, $this->rowCeiling + 1);
        if (count($all) > $this->rowCeiling) {
            throw new ExportLimitExceeded(sprintf(
                'Report %s exceeds the %d-row export ceiling at snapshot %s; narrow the window',
                $name->value,
                $this->rowCeiling,
                $snapshot->id,
            ));
        }

        $rows = array_slice($all, $offset, $request->pageSize);
        $nextOffset = $offset + count($rows);
        $next = $nextOffset < count($all)
            ? ExportCursor::issue($name->value, $snapshot->id, $nextOffset, $this->cursorSecret)->token()
            : null;

        $body = $request->format === ExportFormat::Csv
            ? $this->serialiser->csv($rows, $report->columns(), $offset === 0)
            : $this->serialiser->json($rows);

        return new ExportPage(
            report: $name->value,
            snapshotId: $snapshot->id,
            asOf: $snapshot->asOfIso(),
            format: $request->format,
            body: $body,
            rowCount: count($rows),
            nextCursor: $next,
        );
    }
}
