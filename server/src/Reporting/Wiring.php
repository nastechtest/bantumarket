<?php

declare(strict_types=1);

namespace NasTech\Reporting;

use NasTech\Reporting\Export\ExportSerialiser;
use NasTech\Reporting\Export\ReportExport;
use NasTech\Reporting\Persistence\InMemorySnapshotRepository;
use NasTech\Reporting\Persistence\SnapshotRepository;
use NasTech\Reporting\Persistence\SqlSnapshotRepository;
use NasTech\Reporting\Projection\CaptureProjector;
use NasTech\Reporting\Projection\DisputeProjector;
use NasTech\Reporting\Projection\InspectionProjector;
use NasTech\Reporting\Projection\ListingProjector;
use NasTech\Reporting\Projection\MoneyProjector;
use NasTech\Reporting\Projection\PayoutProjector;
use NasTech\Reporting\Projection\ProjectionWorker;
use NasTech\Reporting\Projection\Projector;
use NasTech\Reporting\Projection\SalesProjector;
use NasTech\Reporting\Projection\SearchProjector;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Static factories for the composition root. Wiring decides construction order,
 * never a rule. Nothing here touches another module's class: Reporting's only
 * input port is EventFeed, implemented by the integration adapter.
 */
final class Wiring
{
    /**
     * @return list<Projector>
     */
    public static function projectors(Store $store): array
    {
        return [
            new ListingProjector($store),
            new SearchProjector($store),
            new SalesProjector($store),
            new MoneyProjector($store),
            new PayoutProjector($store),
            new DisputeProjector($store),
            new CaptureProjector($store),
            new InspectionProjector($store),
        ];
    }

    public static function projectionWorker(Store $store, Clock $clock): ProjectionWorker
    {
        return new ProjectionWorker($store, self::projectors($store), $clock);
    }

    public static function snapshotRepository(Store $store): SnapshotRepository
    {
        return new InMemorySnapshotRepository($store);
    }

    public static function reportCatalogue(Store $store): ReportCatalogue
    {
        return new ReportCatalogue($store);
    }

    public static function reportRunner(Store $store, Clock $clock): ReportRunner
    {
        return new ReportRunner(
            $store,
            self::reportCatalogue($store),
            self::snapshotRepository($store),
            $clock,
        );
    }

    public static function export(Store $store, string $cursorSecret): ReportExport
    {
        return new ReportExport(
            self::reportCatalogue($store),
            self::snapshotRepository($store),
            new ExportSerialiser(),
            $cursorSecret,
        );
    }

    /**
     * @param \Closure(string, array<string,mixed>): list<array<string,mixed>> $query
     * @param \Closure(string, array<string,mixed>): int $execute
     */
    public static function sqlSnapshotRepository(\Closure $query, \Closure $execute): SnapshotRepository
    {
        return new SqlSnapshotRepository($query, $execute);
    }

    /**
     * Apply Reporting's storage constraints to a store. The migration applies
     * the same lists as DDL; ReportingDdlTest compares them.
     */
    public static function install(Store $store): void
    {
        if ($store instanceof InMemoryStore) {
            Schema::apply($store);
        }
    }
}
