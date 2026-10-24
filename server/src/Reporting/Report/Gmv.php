<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * GMV on completed orders, with refunds shown separately.
 *
 * GMV is the value of orders that completed, not the sum of every payment: an
 * order cancelled before handover never became trade. Refunds are a second
 * column rather than a subtraction from the first, because "we sold R100 and
 * refunded R20" and "we sold R80" are different facts about a marketplace.
 */
final class Gmv extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::Gmv;
    }

    public function description(): string
    {
        return 'Gross merchandise value of completed orders, with refunds separated.';
    }

    public function laggingSources(): array
    {
        return ['order_facts (PaymentRecorded, OrderCompleted, RefundSettled)'];
    }

    public function columns(): array
    {
        return [
            'currency' => 'string',
            'completed_orders' => 'integer',
            'gmv_cents' => 'cents',
            'refunded_cents' => 'cents',
            'net_gmv_cents' => 'cents',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $buckets = [];
        foreach ($this->facts('order_facts', $snapshot, 'completed_at', 'completed_ingested_at') as $row) {
            $currency = (string) $row['currency'];
            if (!isset($buckets[$currency])) {
                $buckets[$currency] = ['orders' => 0, 'gmv' => 0, 'refunded' => 0];
            }
            $buckets[$currency]['orders']++;
            $buckets[$currency]['gmv'] += (int) $row['gross_cents'];

            $refundAt = $this->timestamp($row['refunded_at'] ?? null);
            $refundIngested = $this->timestamp($row['refunded_ingested_at'] ?? null);
            if ($refundAt !== null && $refundAt <= $snapshot->asOf
                && $refundIngested !== null && $refundIngested <= $snapshot->ingestedThrough) {
                $buckets[$currency]['refunded'] += (int) $row['refunded_cents'];
            }
        }

        ksort($buckets);
        $rows = [];
        foreach ($buckets as $currency => $bucket) {
            $rows[] = [
                'currency' => $currency,
                'completed_orders' => $bucket['orders'],
                'gmv_cents' => $bucket['gmv'],
                'refunded_cents' => $bucket['refunded'],
                'net_gmv_cents' => $bucket['gmv'] - $bucket['refunded'],
            ];
        }

        return $rows;
    }
}
