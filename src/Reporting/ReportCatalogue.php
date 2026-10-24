<?php

declare(strict_types=1);

namespace NasTech\Reporting;

use NasTech\Reporting\Report\CaptureCostPerItem;
use NasTech\Reporting\Report\CaptureJobsByState;
use NasTech\Reporting\Report\CommissionAccrued;
use NasTech\Reporting\Report\DisputeOutcomeMix;
use NasTech\Reporting\Report\DisputeRate;
use NasTech\Reporting\Report\Gmv;
use NasTech\Reporting\Report\InspectionToPurchase;
use NasTech\Reporting\Report\ListingToLiveConversion;
use NasTech\Reporting\Report\ListingsCreated;
use NasTech\Reporting\Report\ListingsLive;
use NasTech\Reporting\Report\PayoutLatency;
use NasTech\Reporting\Report\Report;
use NasTech\Reporting\Report\SearchZeroResults;
use NasTech\Reporting\Report\SellerCohorts;
use NasTech\Reporting\Report\SettlementReconciliation;
use NasTech\Reporting\Report\TakeRate;
use NasTech\Reporting\Report\TimeToFirstListing;
use NasTech\SharedKernel\Persistence\Store;

/**
 * The catalogue: one object per ReportName, no lookup table that can drift.
 *
 * Construction is closed — a new report must be added to ReportName, this
 * class, the migration's view list and the endpoint document, and the tests
 * fail until all four agree.
 */
final class ReportCatalogue
{
    /** @var array<string, Report> */
    private array $reports = [];

    public function __construct(Store $store)
    {
        foreach ($this->build($store) as $report) {
            $this->reports[$report->name()->value] = $report;
        }
    }

    public function get(ReportName $name): Report
    {
        return $this->reports[$name->value];
    }

    public function byName(string $name): Report
    {
        $case = ReportName::tryFrom($name);
        if ($case === null) {
            throw new \InvalidArgumentException("Unknown report: {$name}");
        }

        return $this->get($case);
    }

    /**
     * @return list<Report>
     */
    public function all(): array
    {
        $ordered = [];
        foreach (ReportName::cases() as $name) {
            $ordered[] = $this->reports[$name->value];
        }

        return $ordered;
    }

    /**
     * @return list<Report>
     */
    private function build(Store $store): array
    {
        return [
            new ListingsCreated($store),
            new ListingsLive($store),
            new ListingToLiveConversion($store),
            new TimeToFirstListing($store),
            new SearchZeroResults($store),
            new Gmv($store),
            new CommissionAccrued($store),
            new TakeRate($store),
            new PayoutLatency($store),
            new DisputeRate($store),
            new DisputeOutcomeMix($store),
            new CaptureJobsByState($store),
            new CaptureCostPerItem($store),
            new InspectionToPurchase($store),
            new SellerCohorts($store),
            new SettlementReconciliation($store),
        ];
    }
}
