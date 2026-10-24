<?php

declare(strict_types=1);

namespace NasTech\Reporting\Report;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportSnapshot;

/**
 * Commission accrued, from the evidence rows and only those.
 *
 * `forward_cents` is the sum of forward commission entries; `reversal_cents` is
 * the absolute sum of reversal entries. `ledger_net_cents` is the ledger's own
 * commission rows. `delta_cents` must be zero: a non-zero delta means the
 * projection and the ledger disagree, and that is the bug this report exists to
 * make visible before a settlement file does.
 *
 * The refunded-sale fixture is the load-bearing test: the forward entry and the
 * contra reversal net to zero, and the report must not sum order totals to get
 * there. Summing prices is how a reversal is double-counted.
 */
final class CommissionAccrued extends AbstractReport
{
    public function name(): ReportName
    {
        return ReportName::CommissionAccrued;
    }

    public function description(): string
    {
        return 'Commission earned net of reversals, reconciled to ledger commission rows.';
    }

    public function laggingSources(): array
    {
        return ['commission_facts (CommissionEntryRecorded)', 'ledger_facts (LedgerEntryRecorded)'];
    }

    public function columns(): array
    {
        return [
            'currency' => 'string',
            'forward_cents' => 'cents',
            'reversal_cents' => 'cents',
            'net_cents' => 'cents',
            'ledger_net_cents' => 'cents',
            'delta_cents' => 'cents',
        ];
    }

    protected function compute(ReportSnapshot $snapshot): array
    {
        $buckets = [];
        foreach ($this->facts('commission_facts', $snapshot) as $row) {
            $currency = (string) $row['currency'];
            if (!isset($buckets[$currency])) {
                $buckets[$currency] = ['forward' => 0, 'reversal' => 0, 'ledger' => 0];
            }
            $amount = (int) $row['amount_cents'];
            if ((string) $row['kind'] === 'FORWARD') {
                $buckets[$currency]['forward'] += $amount;
            } else {
                $buckets[$currency]['reversal'] += abs($amount);
            }
        }

        foreach ($this->facts('ledger_facts', $snapshot) as $row) {
            $type = (string) $row['entry_type'];
            if (!in_array($type, ['COMMISSION', 'COMMISSION_REVERSAL'], true)) {
                continue;
            }
            $currency = (string) $row['currency'];
            if (!isset($buckets[$currency])) {
                $buckets[$currency] = ['forward' => 0, 'reversal' => 0, 'ledger' => 0];
            }
            // Ledger amounts are signed seller-side: commission is a debit, so
            // the platform's take is the negation.
            $buckets[$currency]['ledger'] += -(int) $row['amount_cents'];
        }

        ksort($buckets);
        $rows = [];
        foreach ($buckets as $currency => $bucket) {
            $net = $bucket['forward'] - $bucket['reversal'];
            $rows[] = [
                'currency' => $currency,
                'forward_cents' => $bucket['forward'],
                'reversal_cents' => $bucket['reversal'],
                'net_cents' => $net,
                'ledger_net_cents' => $bucket['ledger'],
                'delta_cents' => $net - $bucket['ledger'],
            ];
        }

        return $rows;
    }
}
