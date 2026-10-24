<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * One version of one message. Rows are never updated or deleted.
 *
 * An edit is a new row pointing at the row it supersedes; a tombstone is a row with
 * no body pointing at the row it hides. The current view folds the chain, but the
 * export returns every version, so "what was said and then removed" is answerable
 * to a dispute and to the author's own data export.
 *
 * `clientMessageId` is the sender's retry token. It is required, not optional,
 * because an optional idempotency key is an idempotency key that is missing on the
 * one request that got retried.
 */
final class Message
{
    /**
     * @param list<MessageAttachment> $attachments
     */
    private function __construct(
        public readonly string $id,
        public readonly string $threadId,
        public readonly int $sequence,
        public readonly string $senderId,
        public readonly MessageKind $kind,
        public readonly ?MessageBody $body,
        public readonly string $bodyDigest,
        public readonly ?string $supersedesId,
        public readonly string $clientMessageId,
        public readonly \DateTimeImmutable $createdAt,
        public readonly array $attachments = [],
    ) {
    }

    /**
     * @param list<MessageAttachment> $attachments
     */
    public static function say(
        string $id,
        string $threadId,
        int $sequence,
        string $senderId,
        MessageBody $body,
        string $clientMessageId,
        \DateTimeImmutable $at,
        array $attachments = [],
    ): self {
        self::assertSequence($sequence);
        self::assertClientId($clientMessageId);

        return new self(
            $id,
            $threadId,
            $sequence,
            $senderId,
            MessageKind::MESSAGE,
            $body,
            $body->digest(),
            null,
            $clientMessageId,
            $at,
            $attachments,
        );
    }

    /**
     * @param list<MessageAttachment> $attachments
     */
    public static function edit(
        self $previous,
        string $id,
        int $sequence,
        MessageBody $body,
        string $clientMessageId,
        \DateTimeImmutable $at,
        array $attachments = [],
    ): self {
        if ($previous->kind === MessageKind::TOMBSTONE) {
            throw new MessageRefused('A deleted message cannot be edited back into existence');
        }
        self::assertSequence($sequence, $previous->sequence);
        self::assertClientId($clientMessageId);

        return new self(
            $id,
            $previous->threadId,
            $sequence,
            $previous->senderId,
            MessageKind::EDIT,
            $body,
            $body->digest(),
            $previous->id,
            $clientMessageId,
            $at,
            $attachments,
        );
    }

    public static function tombstone(
        self $previous,
        string $id,
        int $sequence,
        string $clientMessageId,
        \DateTimeImmutable $at,
    ): self {
        if ($previous->kind === MessageKind::TOMBSTONE) {
            throw new MessageRefused('This message is already deleted');
        }
        self::assertSequence($sequence, $previous->sequence);
        self::assertClientId($clientMessageId);

        return new self(
            $id,
            $previous->threadId,
            $sequence,
            $previous->senderId,
            MessageKind::TOMBSTONE,
            null,
            MessageBody::tombstone()->digest(),
            $previous->id,
            $clientMessageId,
            $at,
        );
    }

    /**
     * @param array<string,mixed> $row
     * @param list<MessageAttachment> $attachments
     */
    public static function fromRow(array $row, array $attachments = []): self
    {
        $kind = MessageKind::from((string) $row['kind']);
        $body = $row['body'] === null ? null : MessageBody::fromText((string) $row['body']);

        return new self(
            id: (string) $row['id'],
            threadId: (string) $row['thread_id'],
            sequence: (int) $row['sequence'],
            senderId: (string) $row['sender_id'],
            kind: $kind,
            body: $body,
            bodyDigest: (string) $row['body_digest'],
            supersedesId: $row['supersedes_id'] === null ? null : (string) $row['supersedes_id'],
            clientMessageId: (string) $row['client_message_id'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
            attachments: $attachments,
        );
    }

    public function isDeleted(): bool
    {
        return $this->kind === MessageKind::TOMBSTONE;
    }

    /** The author is the only account that may edit or delete a version. */
    public function requireAuthor(string $accountId): void
    {
        if ($accountId !== $this->senderId) {
            throw new MessageRefused('Only the author of a message may edit or delete it');
        }
    }

    /**
     * The wire shape. A tombstone says it was deleted and carries no body; it is
     * present in the list because an empty gap is indistinguishable from a message
     * that never existed, which is exactly the ambiguity a delete must not create.
     *
     * @return array<string,mixed>
     */
    public function toWire(): array
    {
        return [
            'id' => $this->id,
            'thread_id' => $this->threadId,
            'sequence' => $this->sequence,
            'sender_id' => $this->senderId,
            'kind' => $this->kind->value,
            'body' => $this->body?->text,
            'deleted' => $this->isDeleted(),
            'supersedes_id' => $this->supersedesId,
            'attachments' => array_map(
                static fn (MessageAttachment $a): array => [
                    'media_id' => $a->mediaId,
                    'kind' => $a->kind,
                    'position' => $a->position,
                ],
                $this->attachments,
            ),
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'thread_id' => $this->threadId,
            'sequence' => $this->sequence,
            'sender_id' => $this->senderId,
            'kind' => $this->kind->value,
            'body' => $this->body?->text,
            'body_digest' => $this->bodyDigest,
            'supersedes_id' => $this->supersedesId,
            'client_message_id' => $this->clientMessageId,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }

    private static function assertSequence(int $sequence, int $after = 0): void
    {
        if ($sequence <= $after) {
            throw new MessageRefused('A message sequence advances strictly within its thread');
        }
    }

    private static function assertClientId(string $clientMessageId): void
    {
        if (!preg_match('/^[A-Za-z0-9_\-]{8,64}$/', $clientMessageId)) {
            throw new MessageRefused('A client message id is 8–64 url-safe characters; it is the retry key');
        }
    }
}
