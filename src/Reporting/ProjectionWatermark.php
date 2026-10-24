<?php

declare(strict_types=1);

namespace NasTech\Reporting;

/**
 * What the projection has applied. Kept as a row, not as a cache: the
 * snapshot machinery and the "late event" test both read it, and a restart that
 * forgot the watermark would replay every event into append-only fact tables.
 */
final class ProjectionWatermark
{
    public function __construct(
        public readonly int $appliedEvents,
        public readonly int $ignoredEvents,
        public readonly ?\DateTimeImmutable $lastOccurredAt,
        public readonly ?\DateTimeImmutable $lastIngestedAt,
        public readonly ?string $lastEventId,
    ) {
    }

    public static function empty(): self
    {
        return new self(0, 0, null, null, null);
    }

    public function asOf(): \DateTimeImmutable
    {
        return $this->lastOccurredAt ?? new \DateTimeImmutable('1970-01-01T00:00:00+00:00');
    }

    public function ingestedThrough(): \DateTimeImmutable
    {
        return $this->lastIngestedAt ?? new \DateTimeImmutable('1970-01-01T00:00:00+00:00');
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => 'reporting',
            'applied_events' => $this->appliedEvents,
            'ignored_events' => $this->ignoredEvents,
            'last_occurred_at' => $this->lastOccurredAt?->format(\DateTimeInterface::ATOM),
            'last_ingested_at' => $this->lastIngestedAt?->format(\DateTimeInterface::ATOM),
            'last_event_id' => $this->lastEventId,
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            appliedEvents: (int) $row['applied_events'],
            ignoredEvents: (int) $row['ignored_events'],
            lastOccurredAt: $row['last_occurred_at'] === null ? null : new \DateTimeImmutable((string) $row['last_occurred_at']),
            lastIngestedAt: $row['last_ingested_at'] === null ? null : new \DateTimeImmutable((string) $row['last_ingested_at']),
            lastEventId: $row['last_event_id'] === null ? null : (string) $row['last_event_id'],
        );
    }
}
