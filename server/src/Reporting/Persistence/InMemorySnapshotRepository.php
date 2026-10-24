<?php

declare(strict_types=1);

namespace NasTech\Reporting\Persistence;

use NasTech\Reporting\ReportSnapshot;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Snapshot repository over SharedKernel's Store — the implementation the suite
 * runs. The SQL repository under SqlSnapshotRepository speaks the same schema.
 */
final class InMemorySnapshotRepository implements SnapshotRepository
{
    public function __construct(private readonly Store $store)
    {
    }

    public function save(ReportSnapshot $snapshot): void
    {
        $this->store->insert('report_snapshots', $snapshot->toRow());
    }

    public function find(string $id): ?ReportSnapshot
    {
        $row = $this->store->find('report_snapshots', $id);

        return $row === null ? null : ReportSnapshot::fromRow($row);
    }

    public function latest(): ?ReportSnapshot
    {
        $all = $this->store->all('report_snapshots');
        usort($all, static fn (array $a, array $b): int => strcmp((string) $b['closed_at'], (string) $a['closed_at']));

        return $all === [] ? null : ReportSnapshot::fromRow($all[0]);
    }

    public function recent(int $limit): array
    {
        $all = $this->store->all('report_snapshots');
        usort($all, static fn (array $a, array $b): int => strcmp((string) $b['closed_at'], (string) $a['closed_at']));
        $sliced = array_slice($all, 0, max(0, $limit));

        return array_map(static fn (array $row): ReportSnapshot => ReportSnapshot::fromRow($row), $sliced);
    }
}
