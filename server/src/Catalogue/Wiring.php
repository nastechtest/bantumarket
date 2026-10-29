<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Static factories for the composition root.
 *
 * Every dependency is an explicit constructor argument: no service locator, no
 * container lookup, and no module reaching sideways for a collaborator. The
 * repository is chosen here; the service and the domain never know whether the
 * store is in-memory or PostgreSQL.
 */
final class Wiring
{
    /**
     * Apply Catalogue's storage constraints to a store. The migration applies
     * the same lists as DDL; CatalogueDdlTest compares them.
     */
    public static function install(Store $store): void
    {
        if ($store instanceof InMemoryStore) {
            Schema::apply($store);
        }
    }

    public static function repository(Store $store): CatalogueRepository
    {
        return new InMemoryCatalogueRepository($store);
    }

    public static function service(
        CatalogueRepository $repository,
        UnitOfWork $uow,
        Clock $clock,
    ): CatalogueService {
        return new CatalogueService($repository, $uow, $clock);
    }

    private function __construct()
    {
    }
}
