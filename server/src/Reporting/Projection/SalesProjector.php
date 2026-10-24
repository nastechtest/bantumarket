<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;
use NasTech\Reporting\EventType;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Orders, payments and refunds — lifecycle markers only.
 *
 * This projector never derives a commission. `PaymentRecorded` carries a
 * commission figure for display, but the report's commission total comes from
 * `CommissionEntryRecorded`, which names the evidence row and the ledger entry
 * it produced. Keeping the two apart is what makes the contra-reversal test
 * meaningful: a refund marks the order, and the reversal is a second evidence
 * row, not an edit of the first.
 */
final class SalesProjector implements Projector
{
    public function __construct(private readonly Store $store)
    {
    }

    public function supports(string $eventType): bool
    {
        return in_array($eventType, [
            EventType::PAYMENT_RECORDED,
            EventType::ORDER_COMPLETED,
            EventType::REFUND_SETTLED,
        ], true);
    }

    public function project(EventEnvelope $event): void
    {
        switch ($event->type) {
            case EventType::PAYMENT_RECORDED:
                $this->paid($event);

                return;
            case EventType::ORDER_COMPLETED:
                $this->completed($event);

                return;
            case EventType::REFUND_SETTLED:
                $this->refunded($event);

                return;
        }

        throw new \LogicException('SalesProjector asked to project an event it does not support');
    }

    private function paid(EventEnvelope $event): void
    {
        $orderId = $event->string('order_id');
        $gross = $this->parseRand($event->payload['gross'] ?? null);
        $existing = $this->store->find('order_facts', $orderId);
        if ($existing !== null) {
            // A replayed payment must not overwrite a completed or refunded
            // order's lifecycle with "paid"; the unique key catches duplicates
            // from a new event id too.
            return;
        }
        $this->store->insert('order_facts', [
            'id' => $orderId,
            'order_id' => $orderId,
            'seller_id' => $event->string('seller_id'),
            'listing_id' => $event->optionalString('listing_id'),
            'viewer_session_id' => $event->optionalString('viewer_session_id'),
            'gross_cents' => $gross,
            'currency' => $event->currency(),
            'paid_at' => $event->occurredAt->format(\DateTimeInterface::ATOM),
            'paid_ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
            'completed_at' => null,
            'completed_ingested_at' => null,
            'refunded_at' => null,
            'refunded_ingested_at' => null,
            'refunded_cents' => 0,
            'last_ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
        ]);
    }

    private function completed(EventEnvelope $event): void
    {
        $row = $this->requireOrder($event);
        if ($row['completed_at'] !== null) {
            return;
        }
        $row['completed_at'] = $event->occurredAt->format(\DateTimeInterface::ATOM);
        $row['completed_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
        $row['last_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
        $this->store->update('order_facts', $row);
    }

    private function refunded(EventEnvelope $event): void
    {
        $row = $this->requireOrder($event);
        $refunded = $this->parseRand($event->payload['refunded'] ?? null);
        $row['refunded_cents'] = $refunded;
        $row['refunded_at'] = $event->occurredAt->format(\DateTimeInterface::ATOM);
        $row['refunded_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
        $row['last_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
        $this->store->update('order_facts', $row);
    }

    /**
     * @return array<string,mixed>
     */
    private function requireOrder(EventEnvelope $event): array
    {
        $row = $this->store->find('order_facts', $event->string('order_id'));
        if ($row === null) {
            throw new \RuntimeException(sprintf(
                'Event %s (%s) arrived for order %s before PaymentRecorded',
                $event->id,
                $event->type,
                $event->string('order_id'),
            ));
        }

        return $row;
    }

    private function parseRand(mixed $value): int
    {
        if (is_int($value)) {
            return $value;
        }
        if (!is_string($value) || preg_match('/^\d+(\.\d{1,2})?$/', $value) !== 1) {
            throw new \InvalidArgumentException('Money in an outbox payload must be a decimal rand string or integer cents');
        }
        [$whole, $fraction] = array_pad(explode('.', $value, 2), 2, '');
        $fraction = str_pad(substr($fraction, 0, 2), 2, '0');

        return ((int) $whole) * 100 + (int) $fraction;
    }
}
