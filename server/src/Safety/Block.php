<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * One direction of a block: the reporter refuses contact from the blocked
 * account. The effect is symmetric for messaging — SafetyService::mayMessage()
 * checks both directions — but the row is one person's decision, so a release
 * by the wrong party cannot be inferred from it.
 *
 * The pair is unique in the migration and the in-memory store, which is what
 * makes a retried block the same block rather than a pile of rows saying the
 * same thing.
 */
final class Block
{
    public function __construct(
        public readonly string $id,
        public readonly string $blockerId,
        public readonly string $blockedId,
        public readonly string $reason,
        public readonly \DateTimeImmutable $createdAt,
    ) {
        if ($id === '' || $blockerId === '' || $blockedId === '') {
            throw new SafetyRuleViolation('A block names itself and both accounts');
        }
        if ($blockerId === $blockedId) {
            throw new SafetyRuleViolation('An account cannot block itself');
        }
        if (trim($reason) === '') {
            throw new SafetyRuleViolation('A block records a reason; a silent block cannot be reviewed or released');
        }
    }

    public static function record(
        string $id,
        string $blockerId,
        string $blockedId,
        string $reason,
        \DateTimeImmutable $at,
    ): self {
        return new self($id, $blockerId, $blockedId, trim($reason), $at);
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
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'blocker_id' => $this->blockerId,
            'blocked_id' => $this->blockedId,
            'reason' => $this->reason,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }
}
