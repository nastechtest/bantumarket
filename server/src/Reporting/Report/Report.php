<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * A report is a query with a stated as-of, not a live number.
 *
 * The contract every subclass honours: rows are computed only from projection
 * rows whose business time is at or before `asOf` and whose ingestion time is
 * at or before `ingestedThrough`. That pair is what makes a late event either
 * excluded from an old snapshot or included in a new one — never mixed into a
 * number that has already been quoted.
 */
interface Report
{
    public function name(): ReportName;

    public function description(): string;

    /**
     * Base tables that can lag the source system at this snapshot. Printed with
     * every result so an operator cannot present the number as live.
     *
     * @return list<string>
     */
    public function laggingSources(): array;

    /**
     * Column name => logical type, in output order. Types are the vocabulary the
     * endpoint document and the SQL view use: integer cents are "cents",
     * percentages are "bps".
     *
     * @return array<string,string>
     */
    public function columns(): array;

    /**
     * @return list<array<string,int|string|bool|null>>
     */
    public function rowsFor(ReportSnapshot $snapshot, int $limit): array;
}
