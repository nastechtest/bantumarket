<?php

declare(strict_types=1);

namespace NasTech\Audit;

/**
 * The storage port for audit rows.
 *
 * It is append-only by shape: the interface has `append()` and readers, and no
 * update or delete method exists to be called. The InMemory store enforces the
 * same rule for tests and the migration's trigger enforces it for PostgreSQL.
 */
interface AuditRepository
{
    /**
     * @param array<string,mixed> $row
     */
    public function append(array $row): void;

    /**
     * @return array<string,mixed>|null
     */
    public function find(string $id): ?array;

    /**
     * @return list<array<string,mixed>>
     */
    public function forTarget(string $targetType, string $targetId): array;

    /**
     * @return list<array<string,mixed>>
     */
    public function forRequest(string $requestId): array;

    /**
     * @return list<array<string,mixed>>
     */
    public function forActor(string $actorId): array;

    /**
     * @return list<array<string,mixed>>
     */
    public function all(): array;
}
