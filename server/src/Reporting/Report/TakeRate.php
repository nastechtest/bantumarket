<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * Take rate: commission net of reversals over net GMV.
 *
 * Both sides come from their own evidence, never from each other. Dividing a
 * commission total by an order total would hide a reversal that has not been
 * booked yet behind a larger GMV.
 */
final class TakeRate extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::TakeRate;
    }

    public function description(): string
    {
        return 'Net commission as a share of net GMV, in basis points.';
    }

    public function laggingSources(): array
    {
        return ['order_facts', 'commission_facts', 'ledger_facts'];
    }

    public function columns(): array
    {
        return [
            'currency' => 'string',
            'net_gmv_cents' => 'cents',
            'commission_net_cents' => 'cents',
            'take_rate_bps' => 'bps',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $buckets = [];
        foreach ($this->facts('order_facts', $snapshot, 'completed_at', 'completed_ingested_at') as $row) {
            $currency = (string) $row['currency'];
            $buckets[$currency] = $buckets[$currency] ?? ['gmv' => 0, 'commission' => 0];
            $buckets[$currency]['gmv'] += (int) $row['gross_cents'];
            $refundAt = $this->timestamp($row['refunded_at'] ?? null);
            $refundIngested = $this->timestamp($row['refunded_ingested_at'] ?? null);
            if ($refundAt !== null && $refundAt <= $snapshot->asOf
                && $refundIngested !== null && $refundIngested <= $snapshot->ingestedThrough) {
                $buckets[$currency]['gmv'] -= (int) $row['refunded_cents'];
            }
        }

        foreach ($this->facts('commission_facts', $snapshot) as $row) {
            $currency = (string) $row['currency'];
            $buckets[$currency] = $buckets[$currency] ?? ['gmv' => 0, 'commission' => 0];
            $buckets[$currency]['commission'] += (int) $row['amount_cents'];
        }

        ksort($buckets);
        $rows = [];
        foreach ($buckets as $currency => $bucket) {
            $rows[] = [
                'currency' => $currency,
                'net_gmv_cents' => $bucket['gmv'],
                'commission_net_cents' => $bucket['commission'],
                'take_rate_bps' => $this->bps($bucket['commission'], $bucket['gmv']),
            ];
        }

        return $rows;
    }
}
