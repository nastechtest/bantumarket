<?php

declare(strict_types=1);

namespace NasTech\Tests\Reporting;

use NasTech\Reporting\EventEnvelope;
use NasTech\Reporting\Projection\ProjectionWorker;
use NasTech\Reporting\ReportCatalogue;
use NasTech\Reporting\ReportName;
use NasTech\Reporting\ReportResult;
use NasTech\Reporting\ReportRunner;
use NasTech\Reporting\ReportSnapshot;
use NasTech\Reporting\Wiring;
use NasTech\SharedKernel\FrozenClock;
use NasTech\SharedKernel\Persistence\InMemoryStore;

/**
 * A Reporting projection with time under the test's control.
 *
 * Every event states both clocks explicitly. That is the point of the fixture:
 * a test about a late event must be able to say "this happened on Tuesday and
 * we heard about it on Friday" without relying on wall time or on the order in
 * which the fixture happens to push rows.
 */
final class ReportingFixture
{
    public const SELLER = 'sel_thandi';
    public const BUYER_SESSION = 'vis_sipho_1';

    public readonly InMemoryStore $store;
    public readonly FrozenClock $clock;
    public readonly ProjectionWorker $worker;
    public readonly ReportRunner $runner;
    public readonly ReportCatalogue $catalogue;

    private int $sequence = 0;

    public function __construct(string $now = '2026-11-10T12:00:00+00:00')
    {
        $this->store = new InMemoryStore();
        Wiring::install($this->store);
        $this->clock = FrozenClock::at($now);
        $this->worker = Wiring::projectionWorker($this->store, $this->clock);
        $this->runner = Wiring::reportRunner($this->store, $this->clock);
        $this->catalogue = Wiring::reportCatalogue($this->store);
    }

    /**
     * @param array<string,mixed> $payload
     */
    public function emit(
        string $type,
        array $payload,
        string $occurredAt,
        ?string $ingestedAt = null,
        string $aggregateId = 'agg_1',
        ?string $id = null,
    ): string {
        $this->sequence++;
        $eventId = $id ?? sprintf('evt_%04d', $this->sequence);
        $event = new EventEnvelope(
            id: $eventId,
            type: $type,
            aggregateId: $aggregateId,
            occurredAt: new \DateTimeImmutable($occurredAt),
            ingestedAt: new \DateTimeImmutable($ingestedAt ?? $occurredAt),
            payload: $payload,
        );
        $this->worker->apply($event);

        return $eventId;
    }

    public function advance(string $interval): void
    {
        $this->clock->advance($interval);
    }

    public function snapshot(): ReportSnapshot
    {
        return $this->runner->snapshotNow();
    }

    public function run(ReportName $name, ?ReportSnapshot $snapshot = null, int $limit = ReportRunner::ROW_CEILING): ReportResult
    {
        return $this->runner->run($name, $snapshot, $limit);
    }

    /**
     * @return list<array<string,mixed>>
     */
    public function rows(ReportName $name, ?ReportSnapshot $snapshot = null, int $limit = ReportRunner::ROW_CEILING): array
    {
        return $this->run($name, $snapshot, $limit)->rows;
    }

    /**
     * One completed sale with its commission and ledger evidence.
     *
     * The forward commission and the ledger row are two events because that is
     * what the producers emit; deriving one from the other here would make the
     * reconciliation test prove nothing.
     */
    public function completedSale(
        string $orderId,
        int $grossCents,
        int $commissionCents,
        string $completedAt = '2026-11-02T10:00:00+00:00',
        string $ingestedAt = '2026-11-02T10:01:00+00:00',
        string $sellerId = self::SELLER,
        ?string $listingId = 'lst_0001',
    ): void {
        $gross = intdiv($grossCents, 100) . '.' . str_pad((string) ($grossCents % 100), 2, '0', STR_PAD_LEFT);
        $this->emit('PaymentRecorded', [
            'order_id' => $orderId,
            'seller_id' => $sellerId,
            'listing_id' => $listingId,
            'gross' => $gross,
            'currency' => 'ZAR',
        ], $completedAt, $ingestedAt, $orderId);
        $this->emit('OrderCompleted', [
            'order_id' => $orderId,
        ], $completedAt, $ingestedAt, $orderId);
        $this->emit('CommissionEntryRecorded', [
            'entry_id' => 'cmn_' . $orderId,
            'order_id' => $orderId,
            'seller_id' => $sellerId,
            'kind' => 'FORWARD',
            'amount_cents' => $commissionCents,
            'currency' => 'ZAR',
            'ledger_entry_id' => 'led_' . $orderId,
        ], $completedAt, $ingestedAt, $orderId);
        $this->emit('LedgerEntryRecorded', [
            'entry_id' => 'led_' . $orderId,
            'seller_id' => $sellerId,
            'order_id' => $orderId,
            'entry_type' => 'COMMISSION',
            'amount_cents' => -$commissionCents,
            'currency' => 'ZAR',
        ], $completedAt, $ingestedAt, $orderId);
    }

    public function refund(
        string $orderId,
        int $amountCents,
        int $commissionCents,
        string $at = '2026-11-05T09:00:00+00:00',
        string $ingestedAt = '2026-11-05T09:01:00+00:00',
        string $sellerId = self::SELLER,
    ): void {
        $refunded = intdiv($amountCents, 100) . '.' . str_pad((string) ($amountCents % 100), 2, '0', STR_PAD_LEFT);
        $this->emit('RefundSettled', [
            'order_id' => $orderId,
            'refunded' => $refunded,
            'currency' => 'ZAR',
        ], $at, $ingestedAt, $orderId);
        $this->emit('CommissionEntryRecorded', [
            'entry_id' => 'cmn_rev_' . $orderId,
            'order_id' => $orderId,
            'seller_id' => $sellerId,
            'kind' => 'REVERSAL',
            'amount_cents' => -$commissionCents,
            'currency' => 'ZAR',
            'ledger_entry_id' => 'led_rev_' . $orderId,
        ], $at, $ingestedAt, $orderId);
        $this->emit('LedgerEntryRecorded', [
            'entry_id' => 'led_rev_' . $orderId,
            'seller_id' => $sellerId,
            'order_id' => $orderId,
            'entry_type' => 'COMMISSION_REVERSAL',
            'amount_cents' => $commissionCents,
            'currency' => 'ZAR',
            'reversal_of' => 'led_' . $orderId,
        ], $at, $ingestedAt, $orderId);
    }
}
