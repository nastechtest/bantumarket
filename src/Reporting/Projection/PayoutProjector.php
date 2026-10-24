<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;
use NasTech\Reporting\EventType;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Payout instructions, one row per seller line.
 *
 * The event carries `oldest_payable_at` per line because a batch total on its
 * own cannot answer "how long did a seller wait". Recomputing it later would
 * mean reading another module's ledger, which Reporting may not do; the
 * producing module (Payouts) knows the date at build time and states it.
 */
final class PayoutProjector implements Projector
{
    public function __construct(private readonly Store $store)
    {
    }

    public function supports(string $eventType): bool
    {
        return in_array($eventType, [EventType::PAYOUT_BATCH_RELEASED, EventType::PAYOUT_BATCH_DEAD], true);
    }

    public function project(EventEnvelope $event): void
    {
        $status = $event->type === EventType::PAYOUT_BATCH_RELEASED ? 'RELEASED' : 'DEAD';
        $batchId = $event->string('batch_id');
        $lines = $event->payload['lines'] ?? null;
        if (!is_array($lines) || $lines === []) {
            throw new \InvalidArgumentException("Payout event {$event->id} carries no lines");
        }

        foreach ($lines as $line) {
            if (!is_array($line)) {
                throw new \InvalidArgumentException('Payout line is not an object');
            }
            $sellerId = (string) ($line['seller_id'] ?? '');
            $amount = $line['amount_cents'] ?? null;
            $oldest = (string) ($line['oldest_payable_at'] ?? '');
            if ($sellerId === '' || !is_int($amount) || $amount <= 0 || $oldest === '') {
                throw new \InvalidArgumentException('Payout line needs seller_id, positive integer amount_cents and oldest_payable_at');
            }
            $id = $batchId . ':' . $sellerId;
            $this->store->insert('payout_line_facts', [
                'id' => $id,
                'batch_id' => $batchId,
                'seller_id' => $sellerId,
                'amount_cents' => $amount,
                'currency' => $event->currency(),
                'oldest_payable_at' => (new \DateTimeImmutable($oldest))->format(\DateTimeInterface::ATOM),
                'released_at' => $status === 'RELEASED' ? $event->occurredAt->format(\DateTimeInterface::ATOM) : null,
                'status' => $status,
                'occurred_at' => $event->occurredAt->format(\DateTimeInterface::ATOM),
                'ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
            ]);
        }
    }
}
