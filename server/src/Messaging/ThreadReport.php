<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * A report from a participant. Append-only: a report is answered by Safety's
 * decision, not edited by the reporter after the fact. Messaging stores it and
 * emits it; it takes no sanctioning decision and holds no sanction state.
 */
final class ThreadReport
{
    public const MAX_DETAILS_BYTES = 2000;

    private function __construct(
        public readonly string $id,
        public readonly string $threadId,
        public readonly string $reporterId,
        public readonly ThreadReportReason $reason,
        public readonly ?string $details,
        public readonly ?int $messageSequence,
        public readonly \DateTimeImmutable $createdAt,
    ) {
    }

    public static function file(
        string $id,
        string $threadId,
        string $reporterId,
        ThreadReportReason $reason,
        ?string $details,
        ?int $messageSequence,
        \DateTimeImmutable $at,
    ): self {
        $details = $details === null ? null : trim($details);
        if ($details === '') {
            $details = null;
        }
        if ($details !== null && strlen($details) > self::MAX_DETAILS_BYTES) {
            throw new MessageRefused(sprintf('Report details are limited to %d bytes', self::MAX_DETAILS_BYTES));
        }
        if ($reason === ThreadReportReason::OTHER && $details === null) {
            throw new MessageRefused('A report with reason OTHER must say what happened');
        }
        if ($messageSequence !== null && $messageSequence < 1) {
            throw new MessageRefused('A report may cite a message sequence, never a zero or negative one');
        }

        return new self($id, $threadId, $reporterId, $reason, $details, $messageSequence, $at);
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            threadId: (string) $row['thread_id'],
            reporterId: (string) $row['reporter_id'],
            reason: ThreadReportReason::from((string) $row['reason']),
            details: $row['details'] === null ? null : (string) $row['details'],
            messageSequence: $row['message_sequence'] === null ? null : (int) $row['message_sequence'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'thread_id' => $this->threadId,
            'reporter_id' => $this->reporterId,
            'reason' => $this->reason->value,
            'details' => $this->details,
            'message_sequence' => $this->messageSequence,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }
}
