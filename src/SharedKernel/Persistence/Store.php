<?php

declare(strict_types=1);

namespace NasTech\SharedKernel\Persistence;

/**
 * Persistence port. Adapters: in-memory (tests, this environment) and
 * PostgreSQL (production). Nothing above this interface may know which is in use.
 */
interface Store
{
    /**
     * @param string $table   logical table, e.g. "ledger_entries"
     * @param string $id      primary key
     * @return array<string,mixed>|null
     */
    public function find(string $table, string $id): ?array;

    /**
     * @return list<array<string,mixed>>
     */
    public function all(string $table): array;

    /**
     * @param array<string,mixed> $record
     */
    public function insert(string $table, array $record): void;

    /**
     * @param array<string,mixed> $record
     */
    public function update(string $table, array $record): void;

    /**
     * Rows that must never be mutated once written.
     *
     * @param list<string> $appendOnlyTables
     */
    public function enforceAppendOnly(array $appendOnlyTables): void;

    /**
     * Columns that must be unique per table. A duplicate insert must fail
     * structurally rather than by code order.
     *
     * @param array<string, list<string>> $uniqueIndexes table => columns
     */
    public function enforceUnique(array $uniqueIndexes): void;
}
