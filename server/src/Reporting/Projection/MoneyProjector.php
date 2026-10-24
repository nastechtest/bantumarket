<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;
use NasTech\Reporting\EventType;
use NasTech\SharedKernel\Persistence\Store;

/**
 * The two money projections, both event-per-row.
 *
 * `ledger_facts` is the settlement ledger as Reporting saw it; `commission_facts`
 * is the pricing evidence. They are separate because the reconciliation report
 * compares them: commission accrued must equal the commission rows the ledger
 * carries, and a refund must produce a *second* commission row that nets the
 * first to zero. If a projector ever summed order totals to produce either
 * number, this file would be the bug the brief calls out.
 */
final class MoneyProjector implements Projector
{
    /** Must match Settlements\Ledger's vocabulary; compared by ReportingDdlTest. */
    public const LEDGER_TYPES = [
        'SELLER_EARNINGS',
        'COMMISSION',
        'COMMISSION_REVERSAL',
        'REFUND',
        'PAYOUT',
        'CHARGEBACK',
        'HOLD',
        'HOLD_RELEASE',
    ];

    public function __construct(private readonly Store $store)
    {
    }

    public function supports(string $eventType): bool
    {
        return in_array($eventType, [EventType::LEDGER_ENTRY_RECORDED, EventType::COMMISSION_ENTRY_RECORDED], true);
    }

    public function project(EventEnvelope $event): void
    {
        if ($event->type === EventType::LEDGER_ENTRY_RECORDED) {
            $this->ledgerEntry($event);

            return;
        }

        $this->commissionEntry($event);
    }

    private function ledgerEntry(EventEnvelope $event): void
    {
        $type = $event->string('entry_type');
        if (!in_array($type, self::LEDGER_TYPES, true)) {
            throw new \InvalidArgumentException("Ledger event carries an unknown entry type: {$type}");
        }
        $amount = $event->cents('amount_cents');
        if ($amount === 0) {
            throw new \InvalidArgumentException('A zero-value ledger row is not evidence and cannot be projected');
        }

        $this->store->insert('ledger_facts', [
            'id' => $event->string('entry_id'),
            'entry_id' => $event->string('entry_id'),
            'seller_id' => $event->string('seller_id'),
            'order_id' => $event->optionalString('order_id'),
            'entry_type' => $type,
            'amount_cents' => $amount,
            'currency' => $event->currency(),
            'reversal_of' => $event->optionalString('reversal_of'),
            'occurred_at' => $event->occurredAt->format(\DateTimeInterface::ATOM),
            'ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
        ]);
    }

    private function commissionEntry(EventEnvelope $event): void
    {
        $kind = $event->string('kind');
        if (!in_array($kind, ['FORWARD', 'REVERSAL'], true)) {
            throw new \InvalidArgumentException("Commission event carries an unknown kind: {$kind}");
        }
        $amount = $event->cents('amount_cents');
        if ($kind === 'FORWARD' && $amount < 0) {
            throw new \InvalidArgumentException('A forward commission cannot be negative');
        }
        if ($kind === 'REVERSAL' && $amount > 0) {
            throw new \InvalidArgumentException('A reversal returns money; a positive reversal is a second charge');
        }

        $this->store->insert('commission_facts', [
            'id' => $event->string('entry_id'),
            'entry_id' => $event->string('entry_id'),
            'order_id' => $event->string('order_id'),
            'seller_id' => $event->string('seller_id'),
            'kind' => $kind,
            'amount_cents' => $amount,
            'currency' => $event->currency(),
            'ledger_entry_id' => $event->optionalString('ledger_entry_id'),
            'policy_id' => $event->optionalString('policy_id'),
            'occurred_at' => $event->occurredAt->format(\DateTimeInterface::ATOM),
            'ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
        ]);
    }
}
