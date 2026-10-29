<?php

declare(strict_types=1);

namespace NasTech\Audit;

use NasTech\SharedKernel\Persistence\Store;

/**
 * AuditRepository over SharedKernel's Store, the adapter the suite runs.
 *
 * The store's append-only list is installed by Wiring::install(), so an update or
 * delete here fails structurally even if a caller finds the store.
 */
final class StoreAuditRepository implements AuditRepository
{
    public function __construct(private readonly Store $store)
    {
    }

    public function append(array $row): void
    {
        $this->store->insert(AuditLog::TABLE, $row);
    }

    public function find(string $id): ?array
    {
        return $this->store->find(AuditLog::TABLE, $id);
    }

    public function forTarget(string $targetType, string $targetId): array
    {
        return array_values(array_filter(
            $this->store->all(AuditLog::TABLE),
            static fn (array $row): bool => (string) $row['target_type'] === $targetType
                && (string) $row['target_id'] === $targetId,
        ));
    }

    public function forRequest(string $requestId): array
    {
        return array_values(array_filter(
            $this->store->all(AuditLog::TABLE),
            static fn (array $row): bool => (string) $row['request_id'] === $requestId,
        ));
    }

    public function forActor(string $actorId): array
    {
        return array_values(array_filter(
            $this->store->all(AuditLog::TABLE),
            static fn (array $row): bool => (string) $row['actor_id'] === $actorId,
        ));
    }

    public function all(): array
    {
        return $this->store->all(AuditLog::TABLE);
    }
}
