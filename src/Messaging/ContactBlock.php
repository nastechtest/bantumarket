<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * One direction of a block, projected from a Safety event.
 *
 * Messaging does not decide that anyone is dangerous; it stores the decision Safety
 * published and refuses writes between the pair. The projection is idempotent on
 * `source_event_id`, because an at-least-once consumer will replay it.
 */
final class ContactBlock
{
    public function __construct(
        public readonly string $id,
        public readonly string $blockerId,
        public readonly string $blockedId,
        public readonly string $reason,
        public readonly string $sourceEventId,
        public readonly bool $active,
        public readonly \DateTimeImmutable $createdAt,
        public readonly ?\DateTimeImmutable $releasedAt,
        public readonly ?string $releaseEventId = null,
    ) {
        if ($blockerId === $blockedId) {
            throw new MessageRefused('An account cannot block itself');
        }
        if (trim($reason) === '') {
            throw new MessageRefused('A block records a reason; a mute with no reason is unreadable in review');
        }
        if (!$active && $releasedAt === null) {
            throw new MessageRefused('An inactive block says when it was released');
        }
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            blockerId: (string) $row['blocker_id'],
            blockedId: (string) $row['blocked_id'],
            reason: (string) $row['reason'],
            sourceEventId: (string) $row['source_event_id'],
            active: (bool) $row['active'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
            releasedAt: $row['released_at'] === null ? null : new \DateTimeImmutable((string) $row['released_at']),
            releaseEventId: ($row['release_event_id'] ?? null) === null ? null : (string) $row['release_event_id'],
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'blocker_id' => $this->blockerId,
            'blocked_id' => $this->blockedId,
            'reason' => $this->reason,
            'source_event_id' => $this->sourceEventId,
            'active' => $this->active,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
            'released_at' => $this->releasedAt?->format(\DateTimeInterface::ATOM),
            'release_event_id' => $this->releaseEventId,
        ];
    }

    public function release(\DateTimeImmutable $at, string $releaseEventId): self
    {
        return new self(
            $this->id,
            $this->blockerId,
            $this->blockedId,
            $this->reason,
            $this->sourceEventId,
            false,
            $this->createdAt,
            $at,
            $releaseEventId,
        );
    }
}
