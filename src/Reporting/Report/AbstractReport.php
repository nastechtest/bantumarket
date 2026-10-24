<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportSnapshot;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Shared snapshot filtering and integer arithmetic.
 *
 * A report that reads a row outside the snapshot is a report that cannot be
 * reproduced; every helper here takes the snapshot and filters both clocks.
 * Percentages are basis points (integer) for the same reason money is integer
 * cents: a report presented to two decimal places should not depend on float
 * accumulation.
 */
abstract class AbstractReport implements Report
{
    public function __construct(protected readonly Store $store)
    {
    }

    public function rowsFor(ReportSnapshot $snapshot, int $limit): array
    {
        $rows = $this->compute($snapshot);
        if ($limit < 1) {
            return [];
        }

        return array_slice($rows, 0, $limit);
    }

    /**
     * @return list<array<string,int|string|bool|null>>
     */
    abstract protected function compute(ReportSnapshot $snapshot): array;

    /**
     * Projection rows visible in this snapshot, filtered by an event pair.
     *
     * @return list<array<string,mixed>>
     */
    protected function facts(
        string $table,
        ReportSnapshot $snapshot,
        string $occurredColumn = 'occurred_at',
        string $ingestedColumn = 'ingested_at',
    ): array {
        $visible = [];
        foreach ($this->store->all($table) as $row) {
            $occurred = $row[$occurredColumn] ?? null;
            $ingested = $row[$ingestedColumn] ?? null;
            if ($occurred === null || $ingested === null) {
                continue;
            }
            if (new \DateTimeImmutable((string) $occurred) > $snapshot->asOf) {
                continue;
            }
            if (new \DateTimeImmutable((string) $ingested) > $snapshot->ingestedThrough) {
                continue;
            }
            $visible[] = $row;
        }

        return $visible;
    }

    protected function bps(int $numerator, int $denominator): int
    {
        if ($denominator === 0) {
            return 0;
        }

        return intdiv($numerator * 10_000 + intdiv($denominator, 2), $denominator);
    }

    protected function timestamp(mixed $value): ?\DateTimeImmutable
    {
        return is_string($value) && $value !== '' ? new \DateTimeImmutable($value) : null;
    }

    /**
     * @param list<array<string,int|string|bool|null>> $rows
     * @return list<array<string,int|string|bool|null>>
     */
    protected function sortedByString(array $rows, string $column): array
    {
        usort($rows, static fn (array $a, array $b): int => strcmp((string) $a[$column], (string) $b[$column]));

        return $rows;
    }
}
