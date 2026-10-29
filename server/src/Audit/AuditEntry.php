<?php

declare(strict_types=1);

namespace NasTech\Audit;

/**
 * One audit row, read back as a typed object.
 *
 * The write side deliberately accepts SharedKernel's AuditRecord: a module must
 * never import Audit to record something, or the audit becomes optional. The
 * read side belongs here, because reconstructing an impersonation is an audit
 * question and the audit console should not be parsing raw columns.
 */
final class AuditEntry
{
    /**
     * @param array<string,mixed>|null $before
     * @param array<string,mixed>|null $after
     */
    public function __construct(
        public readonly string $id,
        public readonly \DateTimeImmutable $occurredAt,
        public readonly string $action,
        public readonly string $targetType,
        public readonly string $targetId,
        public readonly ActorKind $actorKind,
        public readonly string $actorId,
        public readonly string $actorRole,
        public readonly ?string $sessionId,
        public readonly ?string $capability,
        public readonly ?string $subjectId,
        public readonly ?string $impersonatedAccountId,
        public readonly ?array $before,
        public readonly ?array $after,
        public readonly ?string $reason,
        public readonly string $requestId,
        public readonly int $diffBytes,
    ) {
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        $kind = ActorKind::tryFrom((string) $row['actor_kind']);
        if ($kind === null) {
            throw new \UnexpectedValueException(sprintf(
                'Audit row %s carries an actor kind the module does not know: %s',
                (string) $row['id'],
                (string) $row['actor_kind'],
            ));
        }

        return new self(
            id: (string) $row['id'],
            occurredAt: new \DateTimeImmutable((string) $row['occurred_at']),
            action: (string) $row['action'],
            targetType: (string) $row['target_type'],
            targetId: (string) $row['target_id'],
            actorKind: $kind,
            actorId: (string) $row['actor_id'],
            actorRole: (string) $row['actor_role'],
            sessionId: self::nullableString($row['session_id'] ?? null),
            capability: self::nullableString($row['capability'] ?? null),
            subjectId: self::nullableString($row['subject_id'] ?? null),
            impersonatedAccountId: self::nullableString($row['impersonated_account_id'] ?? null),
            before: self::document($row['before_state'] ?? null),
            after: self::document($row['after_state'] ?? null),
            reason: self::nullableString($row['reason'] ?? null),
            requestId: (string) $row['request_id'],
            diffBytes: (int) ($row['diff_bytes'] ?? 0),
        );
    }

    public function isImpersonation(): bool
    {
        return $this->impersonatedAccountId !== null;
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'occurred_at' => $this->occurredAt->format(\DateTimeInterface::ATOM),
            'action' => $this->action,
            'target_type' => $this->targetType,
            'target_id' => $this->targetId,
            'actor_kind' => $this->actorKind->value,
            'actor_id' => $this->actorId,
            'actor_role' => $this->actorRole,
            'session_id' => $this->sessionId,
            'capability' => $this->capability,
            'subject_id' => $this->subjectId,
            'impersonated_account_id' => $this->impersonatedAccountId,
            'before' => $this->before,
            'after' => $this->after,
            'reason' => $this->reason,
            'request_id' => $this->requestId,
            'diff_bytes' => $this->diffBytes,
        ];
    }

    private static function nullableString(mixed $value): ?string
    {
        return $value === null || $value === '' ? null : (string) $value;
    }

    /**
     * @return array<string,mixed>|null
     */
    private static function document(mixed $value): ?array
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_array($value)) {
            return $value;
        }

        $decoded = json_decode((string) $value, true);
        if (!is_array($decoded)) {
            throw new \UnexpectedValueException('An audit before/after value is not a JSON document');
        }

        return $decoded;
    }
}
