<?php

declare(strict_types=1);

namespace NasTech\Reporting;

use NasTech\SharedKernel\Persistence\InMemoryStore;

/**
 * Reporting's tables and views, as data.
 *
 * Every table here is a projection of events. None is a copy of another
 * module's schema: the module graph gives Reporting no outbound edges, so the
 * only legal input is the outbox. That is also why a report can be reconciled:
 * the projection stores the ledger entry id it saw, and the reconciliation
 * report compares the event-sourced totals with the ledger evidence rather than
 * summing order prices.
 *
 * The view list is the third side of a triangle — PHP report, SQL view, endpoint
 * document — and ReportingDdlTest checks all three agree.
 */
final class Schema
{
    /**
     * @var array<string, string> bare table => "schema.table"
     */
    public const TABLES = [
        'projected_events' => 'reporting.projected_events',
        'projection_state' => 'reporting.projection_state',
        'seller_cohorts' => 'reporting.seller_cohorts',
        'listing_facts' => 'reporting.listing_facts',
        'search_facts' => 'reporting.search_facts',
        'order_facts' => 'reporting.order_facts',
        'commission_facts' => 'reporting.commission_facts',
        'ledger_facts' => 'reporting.ledger_facts',
        'payout_line_facts' => 'reporting.payout_line_facts',
        'dispute_facts' => 'reporting.dispute_facts',
        'capture_facts' => 'reporting.capture_facts',
        'inspection_facts' => 'reporting.inspection_facts',
        'report_snapshots' => 'reporting.report_snapshots',
        'report_runs' => 'reporting.report_runs',
    ];

    /**
     * Evidence rows. A projection row that can be edited after the fact is not
     * a projection of an immutable event; it is a second ledger with no
     * triggers. Rows that carry a lifecycle (listing live, dispute decided,
     * capture state) are mutable by design and are listed in MUTABLE below.
     *
     * @var list<string>
     */
    public const APPEND_ONLY_TABLES = [
        'projected_events',
        'search_facts',
        'commission_facts',
        'ledger_facts',
        'payout_line_facts',
        'inspection_facts',
        'report_snapshots',
        'report_runs',
    ];

    /**
     * @var array<string, list<string>> table => columns joined with "+"
     */
    public const UNIQUE_INDEXES = [
        'projected_events' => ['event_id'],
        'seller_cohorts' => ['seller_id'],
        'listing_facts' => ['listing_id'],
        'search_facts' => ['query_id'],
        'order_facts' => ['order_id'],
        'commission_facts' => ['entry_id'],
        'ledger_facts' => ['entry_id'],
        'payout_line_facts' => ['batch_id+seller_id'],
        'dispute_facts' => ['case_id'],
        'capture_facts' => ['job_id'],
        'inspection_facts' => ['view_id'],
    ];

    /**
     * Named row rules, mirrored by CONSTRAINT names in 013_reporting.sql.
     *
     * @var array<string, list<string>>
     */
    public const ROW_CHECKS = [
        'reporting.projected_events' => [
            'projection_outcome_is_known',
            'projection_ingest_follows_occurrence',
        ],
        'reporting.projection_state' => [
            'projection_counters_are_not_negative',
        ],
        'reporting.seller_cohorts' => [
            'cohort_week_is_iso',
            'cohort_city_is_present',
        ],
        'reporting.listing_facts' => [
            'listing_fact_dates_are_ordered',
            'listing_media_count_is_not_negative',
            'currency_is_iso',
        ],
        'reporting.search_facts' => [
            'search_result_count_is_not_negative',
        ],
        'reporting.order_facts' => [
            'order_gross_is_not_negative',
            'refund_does_not_exceed_gross',
            'order_completion_follows_payment',
            'currency_is_iso',
        ],
        'reporting.commission_facts' => [
            'commission_sign_follows_kind',
            'commission_fact_has_evidence',
            'currency_is_iso',
        ],
        'reporting.ledger_facts' => [
            'ledger_amount_is_not_zero',
            'ledger_type_is_known',
            'currency_is_iso',
        ],
        'reporting.payout_line_facts' => [
            'payout_amount_is_positive',
            'payout_status_is_known',
            'payout_released_after_payable',
            'currency_is_iso',
        ],
        'reporting.dispute_facts' => [
            'dispute_outcome_is_known',
            'dispute_decision_follows_open',
        ],
        'reporting.capture_facts' => [
            'capture_state_is_known',
            'capture_cost_is_not_negative',
            'currency_is_iso',
        ],
        'reporting.report_snapshots' => [
            'snapshot_knows_nothing_from_the_future',
        ],
        'reporting.report_runs' => [
            'report_row_count_is_not_negative',
        ],
    ];

    /**
     * @return list<string> report view names, from the catalogue
     */
    public static function views(): array
    {
        return array_map(
            static fn (ReportName $name): string => $name->view(),
            ReportName::cases(),
        );
    }

    public static function apply(InMemoryStore $store): void
    {
        $store->enforceAppendOnly(self::APPEND_ONLY_TABLES);
        $store->enforceUnique(self::UNIQUE_INDEXES);
    }
}
