<?php

declare(strict_types=1);

namespace NasTech\Reporting;

/**
 * A report's rows plus the facts needed to read them honestly: which snapshot
 * they came from, which base tables can lag, and whether the row ceiling cut
 * the answer short.
 *
 * `truncated` is not a detail. A finance number silently capped at 1,000 rows
 * looks exactly like a complete one, so the caller is told and the export path
 * is the only way past it.
 */
final class ReportResult
{
    /**
     * @param list<array<string,int|string|bool|null>> $rows
     * @param list<string> $laggingSources
     */
    public function __construct(
        public readonly ReportName $report,
        public readonly string $snapshotId,
        public readonly string $asOf,
        public readonly string $ingestedThrough,
        public readonly array $rows,
        public readonly array $laggingSources,
        public readonly bool $truncated,
    ) {
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'report' => $this->report->value,
            'snapshot_id' => $this->snapshotId,
            'as_of' => $this->asOf,
            'ingested_through' => $this->ingestedThrough,
            'lagging_sources' => $this->laggingSources,
            'truncated' => $this->truncated,
            'rows' => $this->rows,
        ];
    }
}
