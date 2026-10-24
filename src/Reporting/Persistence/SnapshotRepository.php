<?php

declare(strict_types=1);

namespace NasTech\Reporting\Persistence;

use NasTech\Reporting\ReportSnapshot;

/**
 * Snapshot storage. A snapshot is append-only: the same id always answers the
 * same question with the same as_of, which is what makes a number quoted in a
 * board pack defensible a month later.
 */
interface SnapshotRepository
{
    public function save(ReportSnapshot $snapshot): void;

    public function find(string $id): ?ReportSnapshot;

    public function latest(): ?ReportSnapshot;

    /** @return list<ReportSnapshot> */
    public function recent(int $limit): array;
}
