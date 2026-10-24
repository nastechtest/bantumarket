<?php

declare(strict_types=1);

namespace NasTech\Reporting;

/**
 * One event as Reporting receives it, with both times that matter.
 *
 * `occurredAt` is business time — when the sale, view or payout happened.
 * `ingestedAt` is when Reporting learned about it. Conflating the two is how a
 * late webhook silently changes a report that was already sent to the finance
 * team: the report must filter on both, and the snapshot it was generated from
 * stores both watermarks.
 */
final class EventEnvelope
{
    /**
     * @param array<string,mixed> $payload
     */
    public function __construct(
        public readonly string $id,
        public readonly string $type,
        public readonly string $aggregateId,
        public readonly \DateTimeImmutable $occurredAt,
        public readonly \DateTimeImmutable $ingestedAt,
        public readonly array $payload,
    ) {
        if ($id === '') {
            throw new \InvalidArgumentException('An event without an id cannot be de-duplicated');
        }
        if ($type === '') {
            throw new \InvalidArgumentException('An event without a type cannot be projected');
        }
    }

    /**
     * Build from a SharedKernel outbox row. `ingestedAt` is supplied by the
     * worker's clock: a replay of the same row days later must not pretend the
     * event occurred then.
     *
     * @param array<string,mixed> $row
     */
    public static function fromOutboxRow(array $row, \DateTimeImmutable $ingestedAt): self
    {
        $payload = $row['payload'] ?? [];
        if (is_string($payload)) {
            $decoded = json_decode($payload, true);
            $payload = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($payload)) {
            throw new \InvalidArgumentException('Outbox payload is not an object');
        }

        return new self(
            id: (string) $row['id'],
            type: (string) $row['event_type'],
            aggregateId: (string) ($row['aggregate_id'] ?? ''),
            occurredAt: new \DateTimeImmutable((string) $row['occurred_at']),
            ingestedAt: $ingestedAt,
            payload: $payload,
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'event_id' => $this->id,
            'event_type' => $this->type,
            'aggregate_id' => $this->aggregateId,
            'occurred_at' => $this->occurredAt->format(\DateTimeInterface::ATOM),
            'ingested_at' => $this->ingestedAt->format(\DateTimeInterface::ATOM),
            'payload' => $this->payload,
        ];
    }

    /**
     * Integer cents from a payload field. Refuses a float, because a float in a
     * money projection is how a report agrees with itself and not the ledger.
     */
    public function cents(string $field): int
    {
        return $this->int($field);
    }

    /**
     * A payload integer, with no float coercion. A JSON number that arrived as
     * 12.0 is refused rather than rounded: rounding at the projection boundary
     * is a silent change to a number somebody will reconcile against.
     */
    public function int(string $field): int
    {
        $value = $this->payload[$field] ?? null;
        if (is_int($value)) {
            return $value;
        }
        if (is_string($value) && preg_match('/^-?\d+$/', $value) === 1) {
            return (int) $value;
        }

        throw new \InvalidArgumentException(sprintf(
            'Event %s (%s) has no integer in "%s"; got %s',
            $this->id,
            $this->type,
            $field,
            get_debug_type($value),
        ));
    }

    public function string(string $field): string
    {
        $value = $this->payload[$field] ?? null;
        if (!is_string($value) || $value === '') {
            throw new \InvalidArgumentException(sprintf(
                'Event %s (%s) has no "%s" value',
                $this->id,
                $this->type,
                $field,
            ));
        }

        return $value;
    }

    public function optionalString(string $field): ?string
    {
        $value = $this->payload[$field] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    public function currency(): string
    {
        $currency = $this->optionalString('currency') ?? 'ZAR';
        if (preg_match('/^[A-Z]{3}$/', $currency) !== 1) {
            throw new \InvalidArgumentException("Event {$this->id} carries an impossible currency: {$currency}");
        }

        return $currency;
    }
}
