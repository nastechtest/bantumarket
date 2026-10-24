<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * The cent-level reconciliation between payout instructions and the ledger.
 *
 * `ledger_payout_cents` is the sum of PAYOUT rows Reporting was told about;
 * `released_cents` is what Payouts says it instructed. `payout_delta_cents` must
 * be zero. `commission_delta_cents` repeats the commission check in the same
 * row so a single report can be handed to finance without joining two.
 *
 * A non-zero delta is not adjusted here. An automatic correction is how a
 * provider's bad row silently becomes the platform's bad ledger.
 */
final class SettlementReconciliation extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::SettlementReconciliation;
    }

    public function description(): string
    {
        return 'Payout instructions and commission evidence reconciled to ledger rows to the cent.';
    }

    public function laggingSources(): array
    {
        return ['ledger_facts', 'commission_facts', 'payout_line_facts'];
    }

    public function columns(): array
    {
        return [
            'currency' => 'string',
            'ledger_payout_cents' => 'cents',
            'released_cents' => 'cents',
            'payout_delta_cents' => 'cents',
            'commission_net_cents' => 'cents',
            'ledger_commission_cents' => 'cents',
            'commission_delta_cents' => 'cents',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $buckets = [];
        $bucket = static function (string $currency) use (&$buckets): void {
            $buckets[$currency] = $buckets[$currency] ?? [
                'ledger_payout' => 0,
                'released' => 0,
                'commission_net' => 0,
                'ledger_commission' => 0,
            ];
        };

        foreach ($this->facts('ledger_facts', $snapshot) as $row) {
            $currency = (string) $row['currency'];
            $bucket($currency);
            $type = (string) $row['entry_type'];
            if ($type === 'PAYOUT') {
                // Ledger payout rows are debits, stored negative.
                $buckets[$currency]['ledger_payout'] += -(int) $row['amount_cents'];
            }
            if (in_array($type, ['COMMISSION', 'COMMISSION_REVERSAL'], true)) {
                $buckets[$currency]['ledger_commission'] += -(int) $row['amount_cents'];
            }
        }

        foreach ($this->facts('commission_facts', $snapshot) as $row) {
            $currency = (string) $row['currency'];
            $bucket($currency);
            $buckets[$currency]['commission_net'] += (int) $row['amount_cents'];
        }

        foreach ($this->facts('payout_line_facts', $snapshot, 'released_at', 'ingested_at') as $row) {
            if ((string) $row['status'] !== 'RELEASED') {
                continue;
            }
            $currency = (string) $row['currency'];
            $bucket($currency);
            $buckets[$currency]['released'] += (int) $row['amount_cents'];
        }

        ksort($buckets);
        $rows = [];
        foreach ($buckets as $currency => $bucket) {
            $rows[] = [
                'currency' => $currency,
                'ledger_payout_cents' => $bucket['ledger_payout'],
                'released_cents' => $bucket['released'],
                'payout_delta_cents' => $bucket['released'] - $bucket['ledger_payout'],
                'commission_net_cents' => $bucket['commission_net'],
                'ledger_commission_cents' => $bucket['ledger_commission'],
                'commission_delta_cents' => $bucket['commission_net'] - $bucket['ledger_commission'],
            ];
        }

        return $rows;
    }
}
