<?php

declare(strict_types=1);

namespace NasTech\SharedKernel\Persistence;

/**
 * In-memory Store with the two constraints the money path actually depends on:
 * append-only tables and unique indexes.
 *
 * This is a model of the database, not the database. It exists so the
 * invariants can be executed in an environment where PHP has no PDO driver.
 * The PostgreSQL adapter in Persistence/Sql carries the same constraints down
 * to the storage engine, and that is the version that has to be proven before
 * launch.
 */
final class InMemoryStore implements Store
{
    /** @var array<string, array<string, array<string,mixed>>> */
    private array $data = [];

    /** @var list<string> */
    private array $appendOnly = [];

    /** @var array<string, list<string>> */
    private array $unique = [];

    public function find(string $table, string $id): ?array
    {
        return $this->data[$table][$id] ?? null;
    }

    public function all(string $table): array
    {
        return array_values($this->data[$table] ?? []);
    }

    public function insert(string $table, array $record): void
    {
        $this->assertUnique($table, $record);

        $id = $this->primaryKeyOf($table, $record);
        if (isset($this->data[$table][$id])) {
            throw new UniqueConstraintViolation($table, 'primary', $id);
        }
        $this->data[$table][$id] = $record;
    }

    public function update(string $table, array $record): void
    {
        if (in_array($table, $this->appendOnly, true)) {
            throw new \DomainException(
                "Table {$table} is append-only; a written row cannot be mutated. "
                . 'Reverse it with a contra entry instead.'
            );
        }

        $this->assertUnique($table, $record);

        $id = $this->primaryKeyOf($table, $record);
        if (!isset($this->data[$table][$id])) {
            throw new \RuntimeException("Update of missing row {$table}/{$id}");
        }
        $this->data[$table][$id] = $record;
    }

    public function delete(string $table, string $id): void
    {
        if (in_array($table, $this->appendOnly, true)) {
            throw new \DomainException("Table {$table} is append-only; rows cannot be deleted.");
        }
        unset($this->data[$table][$id]);
    }

    public function enforceAppendOnly(array $appendOnlyTables): void
    {
        $this->appendOnly = $appendOnlyTables;
    }

    public function enforceUnique(array $uniqueIndexes): void
    {
        $this->unique = $uniqueIndexes;
    }

    /**
     * Snapshot/restore is how the unit of work gets real rollback semantics
     * without a storage engine.
     *
     * @return array<string, array<string, array<string,mixed>>>
     */
    public function snapshot(): array
    {
        return $this->data;
    }

    /**
     * @param array<string, array<string, array<string,mixed>>> $state
     */
    public function restore(array $state): void
    {
        $this->data = $state;
    }

    private function assertUnique(string $table, array $record): void
    {
        foreach ($this->unique[$table] ?? [] as $columns) {
            // Postgres treats a NULL as distinct in a unique index, so a nullable
            // column can never collide. Matching that here matters: emulating it
            // wrongly would reject legitimate rows.
            $key = $this->keyForColumns($table, $record, $columns);
            if ($key === null) {
                continue;
            }
            foreach ($this->data[$table] ?? [] as $existingId => $existing) {
                $existingKey = $this->keyForColumns($table, $existing, $columns);
                if ($existingKey === null || $key !== $existingKey) {
                    continue;
                }
                $newId = $this->primaryKeyOf($table, $record);
                if ((string) ($existing['id'] ?? $existingId) === $newId) {
                    continue; // same row updating itself
                }
                throw new UniqueConstraintViolation($table, $columns, $key);
            }
        }
    }

    /**
     * @param array<string,mixed> $record
     */
    private function keyForColumns(string $table, array $record, string $columns): ?string
    {
        $parts = [];
        foreach (explode('+', $columns) as $column) {
            $value = $record[$column] ?? null;
            if ($value === null) {
                return null;
            }
            $parts[] = $column . '=' . (is_scalar($value) ? (string) $value : gettype($value));
        }

        return implode('|', $parts);
    }

    /**
     * @param array<string,mixed> $record
     */
    private function primaryKeyOf(string $table, array $record): string
    {
        if (!isset($record['id'])) {
            throw new \InvalidArgumentException("Record for {$table} has no id");
        }

        return (string) $record['id'];
    }
}
