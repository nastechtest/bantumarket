<?php

declare(strict_types=1);

namespace NasTech\Notifications;

use NasTech\SharedKernel\Id;

/**
 * A record of an event the account must be able to see.
 *
 * It is deliberately not an email and not a message. The only things retained
 * are the outbox event that caused it, an opaque recipient account reference,
 * a kind from a closed vocabulary, the module and subject it points at, and
 * the read instant. There is no phone number, no email address, no message body
 * and no dispute text: those live in the module that owns them, under that
 * module's audience rule.
 *
 * `sourceEventId` is the idempotency key together with (recipient, kind). It is
 * the outbox message id, so an at-least-once replay finds the existing row
 * instead of inserting a second one.
 */
final class Notification
{
    private function __construct(
        public readonly string $id,
        public readonly string $sourceEventId,
        public readonly string $recipientId,
        public readonly NotificationKind $kind,
        public readonly SourceModule $sourceModule,
        public readonly string $subjectType,
        public readonly string $subjectId,
        public readonly \DateTimeImmutable $createdAt,
        public readonly ?\DateTimeImmutable $readAt = null,
    ) {
        self::opaque($this->id, 'notification id');
        self::opaque($this->sourceEventId, 'source event id');
        self::opaque($this->recipientId, 'recipient account');
        self::opaque($this->subjectId, 'subject id');

        if ($this->kind->source() !== $this->sourceModule) {
            throw new NotificationRefused(sprintf(
                'Notification kind %s is caused by %s, not %s',
                $this->kind->value,
                $this->kind->source()->value,
                $this->sourceModule->value,
            ));
        }
        if ($this->kind->subjectType() !== $this->subjectType) {
            throw new NotificationRefused(sprintf(
                'Notification kind %s points at a %s, not a %s',
                $this->kind->value,
                $this->kind->subjectType(),
                $this->subjectType,
            ));
        }
        if ($this->readAt !== null && $this->readAt < $this->createdAt) {
            throw new NotificationRefused('A notification cannot be read before it was created');
        }
    }

    public static function create(
        string $id,
        string $sourceEventId,
        string $recipientId,
        NotificationKind $kind,
        string $subjectId,
        \DateTimeImmutable $createdAt,
    ): self {
        return new self(
            id: $id,
            sourceEventId: $sourceEventId,
            recipientId: $recipientId,
            kind: $kind,
            sourceModule: $kind->source(),
            subjectType: $kind->subjectType(),
            subjectId: $subjectId,
            createdAt: $createdAt,
            readAt: null,
        );
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            sourceEventId: (string) $row['source_event_id'],
            recipientId: (string) $row['recipient_id'],
            kind: NotificationKind::parse((string) $row['kind']),
            sourceModule: SourceModule::from((string) $row['source_module']),
            subjectType: (string) $row['subject_type'],
            subjectId: (string) $row['subject_id'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
            readAt: $row['read_at'] === null ? null : new \DateTimeImmutable((string) $row['read_at']),
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'source_event_id' => $this->sourceEventId,
            'recipient_id' => $this->recipientId,
            'kind' => $this->kind->value,
            'source_module' => $this->sourceModule->value,
            'subject_type' => $this->subjectType,
            'subject_id' => $this->subjectId,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
            'read_at' => $this->readAt?->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * Marking read is the only mutation a notification has. The instant is
     * supplied by the caller so a retry reuses the first read time rather than
     * moving the row; the service returns the stored row when already read.
     */
    public function markRead(\DateTimeImmutable $at): self
    {
        if ($this->readAt !== null) {
            return $this;
        }
        if ($at < $this->createdAt) {
            throw new NotificationRefused('A notification cannot be read before it was created');
        }

        return new self(
            id: $this->id,
            sourceEventId: $this->sourceEventId,
            recipientId: $this->recipientId,
            kind: $this->kind,
            sourceModule: $this->sourceModule,
            subjectType: $this->subjectType,
            subjectId: $this->subjectId,
            createdAt: $this->createdAt,
            readAt: $at,
        );
    }

    public function isRead(): bool
    {
        return $this->readAt !== null;
    }

    private static function opaque(string $value, string $field): void
    {
        try {
            Id::fromString($value);
        } catch (\InvalidArgumentException) {
            throw new NotificationRefused(sprintf(
                'A %s must be an opaque reference of 1–64 url-safe characters; notifications never hold an address or free text',
                $field,
            ));
        }
    }
}
