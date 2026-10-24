<?php

declare(strict_types=1);

namespace NasTech\Reporting\Persistence;

use NasTech\Reporting\ReportSnapshot;
use NasTech\Reporting\Schema;

/**
 * Snapshot repository against reporting.report_snapshots.
 *
 * The closures are the same driver seam Identity and Media use: `query` returns
 * rows, `execute` returns affected rows. No PDO driver exists in this
 * environment, so the SQL is reviewable text and `psql -v ON_ERROR_STOP=1`
 * remains a deploy gate.
 */
final class SqlSnapshotRepository implements SnapshotRepository
{
    /** @var \Closure(string, array<string,mixed>): list<array<string,mixed>> */
    private \Closure $query;

    /** @var \Closure(string, array<string,mixed>): int */
    private \Closure $execute;

    /**
     * @param \Closure(string, array<string,mixed>): list<array<string,mixed>> $query
     * @param \Closure(string, array<string,mixed>): int $execute
     */
    public function __construct(\Closure $query, \Closure $execute)
    {
        $this->query = $query;
        $this->execute = $execute;
    }

    public function save(ReportSnapshot $snapshot): void
    {
        $row = $snapshot->toRow();
        ($this->execute)(
            'INSERT INTO reporting.report_snapshots (id, as_of, ingested_through, closed_at)
             VALUES (:id, :as_of, :ingested_through, :closed_at)',
            $row,
        );
    }

    public function find(string $id): ?ReportSnapshot
    {
        $rows = ($this->query)(
            'SELECT id, as_of, ingested_through, closed_at FROM reporting.report_snapshots WHERE id = :id',
            ['id' => $id],
        );

        return $rows === [] ? null : ReportSnapshot::fromRow($rows[0]);
    }

    public function latest(): ?ReportSnapshot
    {
        $rows = ($this->query)(
            'SELECT id, as_of, ingested_through, closed_at FROM reporting.report_snapshots
             ORDER BY closed_at DESC LIMIT 1',
            [],
        );

        return $rows === [] ? null : ReportSnapshot::fromRow($rows[0]);
    }

    public function recent(int $limit): array
    {
        $rows = ($this->query)(
            'SELECT id, as_of, ingested_through, closed_at FROM reporting.report_snapshots
             ORDER BY closed_at DESC LIMIT :limit',
            ['limit' => max(0, $limit)],
        );

        return array_map(static fn (array $row): ReportSnapshot => ReportSnapshot::fromRow($row), $rows);
    }
}
