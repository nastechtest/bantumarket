<?php

declare(strict_types=1);

namespace NasTech\Audit;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Static factories for the composition root. Wiring decides construction order,
 * never a rule; Application/Kernel.php is the only caller and is
 * controller-owned.
 *
 * The repository and the unit of work must be bound to the same storage. The
 * AuditTrail factory takes them together for that reason: an AuditLog that checks
 * one transaction while writing through another connection would pass the check
 * and still produce a row that survives a rollback.
 */
final class Wiring
{
    /**
     * Apply Audit's storage constraints to a store. The migration applies the
     * same lists as DDL; AuditDdlTest compares them in both directions.
     */
    public static function install(Store $store): void
    {
        if ($store instanceof InMemoryStore) {
            Schema::apply($store);
        }
    }

    public static function auditRepository(Store $store): AuditRepository
    {
        return new StoreAuditRepository($store);
    }

    /**
     * @param \Closure(string, array<string,mixed>): list<array<string,mixed>> $query
     * @param \Closure(string, array<string,mixed>): int $execute
     */
    public static function sqlAuditRepository(\Closure $query, \Closure $execute): AuditRepository
    {
        return new SqlAuditRepository($query, $execute);
    }

    public static function auditLog(
        AuditRepository $repository,
        UnitOfWork $uow,
        Clock $clock,
    ): AuditLog {
        return new AuditLog($repository, $uow, $clock);
    }

    public static function auditTrail(AuditLog $log, UnitOfWork $uow): AuditTrail
    {
        return new AuditTrail($log, $uow);
    }

    /**
     * The common construction: a log and trail over the store's own repository.
     */
    public static function trailFor(Store $store, UnitOfWork $uow, Clock $clock): AuditTrail
    {
        return self::auditTrail(self::auditLog(self::auditRepository($store), $uow, $clock), $uow);
    }
}
