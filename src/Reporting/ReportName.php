<?php

declare(strict_types=1);

namespace NasTech\Reporting;

/**
 * The report catalogue. One case per SQL view in 013_reporting.sql.
 *
 * This enum is the reconciliation point between three things that must not
 * drift: the PHP report object, the view definition and the endpoint document.
 * Adding a case without a view fails ReportingDdlTest; adding a view without a
 * case fails the same test in the other direction.
 */
enum ReportName: string
{
    case ListingsCreated = 'listings_created';
    case ListingsLive = 'listings_live';
    case ListingToLiveConversion = 'listing_to_live_conversion';
    case TimeToFirstListing = 'time_to_first_listing';
    case SearchZeroResults = 'search_zero_results';
    case Gmv = 'gmv';
    case CommissionAccrued = 'commission_accrued';
    case TakeRate = 'take_rate';
    case PayoutLatency = 'payout_latency';
    case DisputeRate = 'dispute_rate';
    case DisputeOutcomeMix = 'dispute_outcome_mix';
    case CaptureJobsByState = 'capture_jobs_by_state';
    case CaptureCostPerItem = 'capture_cost_per_item';
    case InspectionToPurchase = 'inspection_to_purchase';
    case SellerCohorts = 'seller_cohorts';
    case SettlementReconciliation = 'settlement_reconciliation';

    public function view(): string
    {
        return 'reporting.v_' . $this->value;
    }

    public function label(): string
    {
        return str_replace('_', ' ', $this->value);
    }
}
