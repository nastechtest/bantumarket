<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * The driver port SqlMediaRepository speaks through.
 *
 * In production this is a few lines over PDO — `prepare`, `execute`,
 * `fetchAll(ASSOC)` — and nothing above it knows. Here there is no PDO driver and
 * no PostgreSQL server, so the only implementation in this tree is the recording one
 * under tests/Media, which asserts the statements rather than running them.
 *
 * That gap is stated rather than papered over: the SQL in this module has never been
 * parsed by the thing it is written for, exactly as 001_money_path.sql has not, and
 * `psql -v ON_ERROR_STOP=1` remains a gate on deploy.
 */
interface SqlExecutor
{
    /**
     * @return list<array<string,mixed>> rows for a SELECT or a statement with
     *                                    RETURNING; empty for everything else
     */
    public function execute(SqlStatement $statement): array;
}
