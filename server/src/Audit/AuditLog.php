<?php

declare(strict_types=1);

namespace NasTech\Audit;

use NasTech\SharedKernel\AuditSink\AuditRecord;
use NasTech\SharedKernel\AuditSink\AuditSink;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * The durable AuditSink.
 *
 * The two methods inherit their transaction contract from SharedKernel:
 *
 *  - write() refuses to run outside a transaction. This is not a convention the
 *    caller is trusted with; a module that tries to "log later" gets an
 *    AuditRefused, and the action it was part of rolls back with the record.
 *  - writeAttempt() refuses to run *inside* one. A rejected authority has already
 *    rolled the domain transaction back; the attempt is written in its own insert
 *    so it survives the rollback it describes.
 *
 * The class has no update or delete method, and the repository interface has no
 * mutation method to call. The store and the migration trigger enforce the same
 * rule below PHP.
 */
final class AuditLog implements AuditSink
{
    public const TABLE = 'audit_log';

    /** Mirrors AuditRecord::MAX_DIFF_BYTES and the DDL's audit_diff_is_bounded. */
    public const MAX_DIFF_BYTES = AuditRecord::MAX_DIFF_BYTES;

    /** Mirrors the DDL's audit_reason_is_bounded. */
    public const MAX_REASON_BYTES = 2000;

    public function __construct(
        private readonly AuditRepository $repository,
        private readonly UnitOfWork $uow,
        private readonly Clock $clock,
    ) {
    }

    public function write(AuditRecord $record): void
    {
        if (!$this->uow->inTransaction()) {
            throw new AuditRefused(
                'An audit record must be written in the same transaction as the action it describes; '
                . 'the action is refused rather than recorded after the fact'
            );
        }

        $this->append($record);
    }

    public function writeAttempt(AuditRecord $record): void
    {
        if ($this->uow->inTransaction()) {
            throw new AuditRefused(
                'writeAttempt() records a refused action, so it runs after the domain transaction has rolled back'
            );
        }

        $this->append($record);
    }

    public function find(string $id): ?AuditEntry
    {
        $row = $this->repository->find($id);

        return $row === null ? null : AuditEntry::fromRow($row);
    }

    /**
     * @return list<AuditEntry>
     */
    public function forTarget(string $targetType, string $targetId): array
    {
        return $this->entries($this->repository->forTarget($targetType, $targetId));
    }

    /**
     * @return list<AuditEntry>
     */
    public function forRequest(string $requestId): array
    {
        return $this->entries($this->repository->forRequest($requestId));
    }

    /**
     * @return list<AuditEntry>
     */
    public function forActor(string $actorId): array
    {
        return $this->entries($this->repository->forActor($actorId));
    }

    /**
     * @return list<AuditEntry>
     */
    public function all(): array
    {
        return $this->entries($this->repository->all());
    }

    private function append(AuditRecord $record): void
    {
        $this->repository->append($this->rowFor($record, $this->clock->now()));
    }

    /**
     * Turn the shared write model into the row the schema stores.
     *
     * Everything that can be refused is refused here, before the insert: the
     * secret guard runs first so a rejected record never reaches storage, and the
     * staff/impersonation rules are checked while the record is still in hand.
     *
     * @return array<string,mixed>
     */
    private function rowFor(AuditRecord $record, \DateTimeImmutable $occurredAt): array
    {
        SecretGuard::assertClean($record->before, $record->after, $record->reason);

        $actorKind = ActorKind::fromRole($record->actorRole);
        $actorRole = strtolower(trim($record->actorRole));
        if (preg_match('/^[a-z][a-z0-9_]{1,31}$/', $actorRole) !== 1) {
            throw new AuditRefused('An audit actor role is a lower-case word, e.g. buyer, seller, staff or system');
        }

        $capability = $record->capability === null ? null : trim($record->capability);
        if ($capability === '') {
            $capability = null;
        }
        if ($capability !== null && preg_match('/^[a-z][a-z0-9_.]{2,63}$/', $capability) !== 1) {
            throw new AuditRefused('An audit capability is a lower-case dotted verb, e.g. payout.release');
        }
        if ($actorKind->isStaff() && $capability === null) {
            throw new AuditRefused(
                'A staff audit record names the capability it used, so a support action can be reconstructed'
            );
        }

        $subjectId = $record->subjectId === null || trim($record->subjectId) === ''
            ? null
            : trim($record->subjectId);
        $impersonated = $actorKind->isStaff() ? $subjectId : null;
        if ($impersonated !== null) {
            if ($impersonated === $record->actorId) {
                throw new AuditRefused('A staff member cannot impersonate themselves; the audit row would name one account twice');
            }
            if ($capability === null) {
                throw new AuditRefused('An impersonated action names the staff capability that authorised it');
            }
        }

        $reason = $record->reason === null ? null : trim($record->reason);
        if ($reason !== null && strlen($reason) > self::MAX_REASON_BYTES) {
            throw new AuditRefused(sprintf(
                'An audit reason is limited to %d bytes; record an id and digest of a larger document instead',
                self::MAX_REASON_BYTES,
            ));
        }

        $diffBytes = self::diffBytes($record);

        return [
            'id' => Id::generate('aud')->value(),
            'occurred_at' => $occurredAt->format(\DateTimeInterface::ATOM),
            'action' => $record->action,
            'target_type' => $record->targetType,
            'target_id' => $record->targetId,
            'actor_kind' => $actorKind->value,
            'actor_id' => $record->actorId,
            'actor_role' => $actorRole,
            'session_id' => $record->sessionId,
            'capability' => $capability,
            'subject_id' => $subjectId,
            'impersonated_account_id' => $impersonated,
            'reason' => $reason,
            'request_id' => $record->requestId,
            'before_state' => $record->before,
            'after_state' => $record->after,
            'diff_bytes' => $diffBytes,
        ];
    }

    private static function diffBytes(AuditRecord $record): int
    {
        $before = $record->before === null
            ? 0
            : strlen((string) json_encode($record->before, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        $after = $record->after === null
            ? 0
            : strlen((string) json_encode($record->after, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return max($before, $after);
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return list<AuditEntry>
     */
    private function entries(array $rows): array
    {
        return array_map(
            static fn (array $row): AuditEntry => AuditEntry::fromRow($row),
            $rows,
        );
    }
}
