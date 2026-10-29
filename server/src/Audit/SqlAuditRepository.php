<?php

declare(strict_types=1);

namespace NasTech\Audit;

/**
 * AuditRepository against audit.audit_log.
 *
 * The closures are the same driver seam Identity, Media and Reporting use:
 * `query` returns rows, `execute` returns affected rows. No PDO driver exists in
 * this environment, so the SQL below is reviewable text and
 * `psql -v ON_ERROR_STOP=1` remains a deploy gate.
 *
 * The INSERT lists every column explicitly. A column that exists only in the DDL
 * would be silently unpopulated, so AuditDdlTest compares this list (through the
 * rows AuditLog builds) with the migration in both directions.
 */
final class SqlAuditRepository implements AuditRepository
{
    private const COLUMNS = 'id, occurred_at, action, target_type, target_id, actor_kind, '
        . 'actor_id, actor_role, session_id, capability, subject_id, impersonated_account_id, '
        . 'reason, request_id, before_state, after_state, diff_bytes';

    /** @var \Closure(string, array<string,mixed>): list<array<string,mixed>> */
    private \Closure $query;

    /** @var \Closure(string, array<string,mixed>): int */
    private \Closure $execute;

    /**
     * @param \Closure(string, array<string,mixed>): list<array<string,mixed>> $query
     * @param \Closure(string, array<string,mixed>): int $execute
     */
    public function __construct(\Closure $query, \Closure $execute)
    {
        $this->query = $query;
        $this->execute = $execute;
    }

    public function append(array $row): void
    {
        $parameters = $row;
        $parameters['before_state'] = self::encode($row['before_state'] ?? null);
        $parameters['after_state'] = self::encode($row['after_state'] ?? null);

        ($this->execute)(
            'INSERT INTO audit.audit_log (' . self::COLUMNS . ')
             VALUES (:id, :occurred_at, :action, :target_type, :target_id, :actor_kind,
                     :actor_id, :actor_role, :session_id, :capability, :subject_id,
                     :impersonated_account_id, :reason, :request_id,
                     CAST(:before_state AS jsonb), CAST(:after_state AS jsonb), :diff_bytes)',
            $parameters,
        );
    }

    public function find(string $id): ?array
    {
        $rows = ($this->query)(
            'SELECT ' . self::COLUMNS . ' FROM audit.audit_log WHERE id = :id',
            ['id' => $id],
        );

        return $rows === [] ? null : $rows[0];
    }

    public function forTarget(string $targetType, string $targetId): array
    {
        return ($this->query)(
            'SELECT ' . self::COLUMNS . ' FROM audit.audit_log
             WHERE target_type = :target_type AND target_id = :target_id
             ORDER BY occurred_at ASC, id ASC',
            ['target_type' => $targetType, 'target_id' => $targetId],
        );
    }

    public function forRequest(string $requestId): array
    {
        return ($this->query)(
            'SELECT ' . self::COLUMNS . ' FROM audit.audit_log
             WHERE request_id = :request_id
             ORDER BY occurred_at ASC, id ASC',
            ['request_id' => $requestId],
        );
    }

    public function forActor(string $actorId): array
    {
        return ($this->query)(
            'SELECT ' . self::COLUMNS . ' FROM audit.audit_log
             WHERE actor_id = :actor_id
             ORDER BY occurred_at ASC, id ASC',
            ['actor_id' => $actorId],
        );
    }

    public function all(): array
    {
        return ($this->query)(
            'SELECT ' . self::COLUMNS . ' FROM audit.audit_log
             ORDER BY occurred_at ASC, id ASC',
            [],
        );
    }

    private static function encode(mixed $document): ?string
    {
        if ($document === null) {
            return null;
        }

        $encoded = json_encode($document, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($encoded === false) {
            throw new \InvalidArgumentException('An audit diff must be JSON-encodable');
        }

        return $encoded;
    }
}
