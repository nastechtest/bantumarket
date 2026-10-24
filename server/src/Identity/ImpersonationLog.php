<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * One row of the impersonation audit trail. Append-only, two rows per
 * impersonation: START when the bounded session begins, END when it is closed.
 *
 * Why a second row rather than an `ended_at` update: an UPDATE of the start
 * row is exactly the edit a staff member with something to hide would make.
 * The pair is checkable without trusting any application code — an END row
 * names the START row it closes, and a START row has no parent.
 */
final class ImpersonationLog
{
    public const KIND_START = 'START';
    public const KIND_END = 'END';

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            kind: (string) $row['kind'],
            actorAccountId: (string) $row['actor_account_id'],
            targetAccountId: (string) $row['target_account_id'],
            sessionId: (string) $row['session_id'],
            startLogId: $row['start_log_id'] === null ? null : (string) $row['start_log_id'],
            purpose: (string) $row['purpose'],
            recordedAt: new \DateTimeImmutable((string) $row['recorded_at']),
        );
    }

    private function __construct(
        public readonly string $id,
        public readonly string $kind,
        public readonly string $actorAccountId,
        public readonly string $targetAccountId,
        public readonly string $sessionId,
        public readonly ?string $startLogId,
        public readonly string $purpose,
        public readonly \DateTimeImmutable $recordedAt,
    ) {
    }

    public static function start(
        string $id,
        string $actorAccountId,
        string $targetAccountId,
        string $sessionId,
        string $purpose,
        \DateTimeImmutable $now,
    ): self {
        return new self(
            id: $id,
            kind: self::KIND_START,
            actorAccountId: $actorAccountId,
            targetAccountId: $targetAccountId,
            sessionId: $sessionId,
            startLogId: null,
            purpose: self::requirePurpose($purpose, 'An impersonation states its purpose'),
            recordedAt: $now,
        );
    }

    public static function end(
        string $id,
        self $start,
        string $reason,
        \DateTimeImmutable $now,
    ): self {
        if ($start->kind !== self::KIND_START) {
            throw new \DomainException('An END row closes a START row, not another END');
        }

        return new self(
            id: $id,
            kind: self::KIND_END,
            actorAccountId: $start->actorAccountId,
            targetAccountId: $start->targetAccountId,
            sessionId: $start->sessionId,
            startLogId: $start->id,
            purpose: self::requirePurpose($reason, 'Ending an impersonation states why'),
            recordedAt: $now,
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'actor_account_id' => $this->actorAccountId,
            'target_account_id' => $this->targetAccountId,
            'session_id' => $this->sessionId,
            'start_log_id' => $this->startLogId,
            'purpose' => $this->purpose,
            'recorded_at' => $this->recordedAt->format(\DateTimeInterface::ATOM),
        ];
    }

    private static function requirePurpose(string $purpose, string $message): string
    {
        $trimmed = trim($purpose);
        if ($trimmed === '') {
            throw new \InvalidArgumentException($message . '; "investigating" alone is not one');
        }

        return $trimmed;
    }
}
