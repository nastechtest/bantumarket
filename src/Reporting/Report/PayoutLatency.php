<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * How long sellers waited between the oldest payable rand and the instruction.
 *
 * Latency is measured per released line at seller level. A batch that paid two
 * sellers has two answers; an average over the batch total would let one large
 * seller's prompt payout hide another's month-long wait.
 */
final class PayoutLatency extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::PayoutLatency;
    }

    public function description(): string
    {
        return 'Average and worst days from payable to released, per currency.';
    }

    public function laggingSources(): array
    {
        return ['payout_line_facts (PayoutBatchReleased)'];
    }

    public function columns(): array
    {
        return [
            'currency' => 'string',
            'payouts' => 'integer',
            'amount_cents' => 'cents',
            'avg_latency_seconds' => 'integer',
            'max_latency_seconds' => 'integer',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $buckets = [];
        foreach ($this->facts('payout_line_facts', $snapshot, 'released_at', 'ingested_at') as $row) {
            if ((string) $row['status'] !== 'RELEASED') {
                continue;
            }
            $currency = (string) $row['currency'];
            if (!isset($buckets[$currency])) {
                $buckets[$currency] = ['count' => 0, 'amount' => 0, 'seconds' => 0, 'max' => 0];
            }
            $released = new \DateTimeImmutable((string) $row['released_at']);
            $payable = new \DateTimeImmutable((string) $row['oldest_payable_at']);
            $seconds = max(0, $released->getTimestamp() - $payable->getTimestamp());
            $buckets[$currency]['count']++;
            $buckets[$currency]['amount'] += (int) $row['amount_cents'];
            $buckets[$currency]['seconds'] += $seconds;
            $buckets[$currency]['max'] = max($buckets[$currency]['max'], $seconds);
        }

        ksort($buckets);
        $rows = [];
        foreach ($buckets as $currency => $bucket) {
            $rows[] = [
                'currency' => $currency,
                'payouts' => $bucket['count'],
                'amount_cents' => $bucket['amount'],
                'avg_latency_seconds' => intdiv($bucket['seconds'] + intdiv($bucket['count'], 2), $bucket['count']),
                'max_latency_seconds' => $bucket['max'],
            ];
        }

        return $rows;
    }
}
