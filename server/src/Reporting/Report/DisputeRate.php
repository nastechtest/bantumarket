<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * Disputes opened per completed order.
 *
 * The denominator is completed orders, not all orders: a dispute on an order
 * that never completed is usually a payment problem wearing a dispute label,
 * and including it would inflate the rate while hiding the real category.
 */
final class DisputeRate extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::DisputeRate;
    }

    public function description(): string
    {
        return 'Disputes opened as a share of completed orders.';
    }

    public function laggingSources(): array
    {
        return ['order_facts (OrderCompleted)', 'dispute_facts (DisputeOpened)'];
    }

    public function columns(): array
    {
        return [
            'completed_orders' => 'integer',
            'disputes_opened' => 'integer',
            'dispute_rate_bps' => 'bps',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $completed = count($this->facts('order_facts', $snapshot, 'completed_at', 'completed_ingested_at'));
        $disputes = count($this->facts('dispute_facts', $snapshot, 'opened_at', 'opened_ingested_at'));

        return [[
            'completed_orders' => $completed,
            'disputes_opened' => $disputes,
            'dispute_rate_bps' => $this->bps($disputes, $completed),
        ]];
    }
}
