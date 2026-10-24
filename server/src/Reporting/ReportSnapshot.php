<?php

declare(strict_types=1);

namespace NasTech\Reporting;

/**
 * A pinned view of the projection: the only thing a report is allowed to read.
 *
 * `asOf` is the business-time cutoff. `ingestedThrough` is the watermark of
 * events the projection had applied when the snapshot was closed. A late event
 * has occurred_at before asOf but ingested_at after ingestedThrough, so an old
 * snapshot excludes it *by construction*; a new snapshot includes it and
 * states a new as_of. That is the difference between "the number changed" and
 * "the number changed and we can say why".
 */
final class ReportSnapshot
{
    public function __construct(
        public readonly string $id,
        public readonly \DateTimeImmutable $asOf,
        public readonly \DateTimeImmutable $ingestedThrough,
        public readonly \DateTimeImmutable $closedAt,
    ) {
        if ($this->ingestedThrough > $this->closedAt) {
            throw new \InvalidArgumentException('A snapshot cannot know about an event ingested after it closed');
        }
    }

    public static function close(
        string $id,
        \DateTimeImmutable $asOf,
        \DateTimeImmutable $ingestedThrough,
        \DateTimeImmutable $closedAt,
    ): self {
        return new self($id, $asOf, $ingestedThrough, $closedAt);
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'as_of' => $this->asOf->format(\DateTimeInterface::ATOM),
            'ingested_through' => $this->ingestedThrough->format(\DateTimeInterface::ATOM),
            'closed_at' => $this->closedAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            asOf: new \DateTimeImmutable((string) $row['as_of']),
            ingestedThrough: new \DateTimeImmutable((string) $row['ingested_through']),
            closedAt: new \DateTimeImmutable((string) $row['closed_at']),
        );
    }

    public function asOfIso(): string
    {
        return $this->asOf->format(\DateTimeInterface::ATOM);
    }
}
