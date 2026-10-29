<?php

declare(strict_types=1);

namespace NasTech\Audit;

use NasTech\SharedKernel\Persistence\InMemoryStore;

/**
 * The audit log's one table and its rules, as data.
 *
 * The migration (db/migrations/012_audit.sql) applies the same lists as DDL.
 * tests/Audit/AuditDdlTest.php compares them in both directions and feeds rows
 * the module really writes through every named CHECK with
 * tests/Support/DdlRowChecks.php.
 *
 * The table is append-only in every layer that can enforce it: Schema lists it,
 * InMemoryStore refuses update/delete, PostgreSQL gets a BEFORE UPDATE OR DELETE
 * trigger, and neither the application nor the owner role is granted UPDATE or
 * DELETE. There is deliberately no reversal row: unlike a ledger, an audit entry
 * is not an economic fact that can be corrected by contra entry — it records what
 * happened, and the next entry records the correction.
 */
final class Schema
{
    public const SCHEMA = 'audit';

    /**
     * @var array<string, string> bare table => "schema.table"
     */
    public const TABLES = [
        'audit_log' => 'audit.audit_log',
    ];

    /**
     * @var list<string>
     */
    public const APPEND_ONLY_TABLES = [
        'audit_log',
    ];

    /**
     * No unique index beyond the primary key: the same action may legitimately be
     * retried in a new request and recorded twice, and a request may audit more
     * than one row. Idempotency belongs to the action, not to the evidence.
     *
     * @var array<string, list<string>>
     */
    public const UNIQUE_INDEXES = [];

    /**
     * Named row rules, mirrored by CONSTRAINT names in 012_audit.sql.
     *
     * These are the decisions the audit console and a support investigation rely
     * on: who is allowed to be an actor, that a staff action names its capability,
     * that an impersonation names a different account and the same subject, and
     * that a diff cannot grow without bound.
     *
     * @var array<string, list<string>>
     */
    public const ROW_CHECKS = [
        'audit.audit_log' => [
            'audit_action_is_dotted_lowercase',
            'audit_target_is_named',
            'audit_actor_kind_is_known',
            'audit_actor_is_named',
            'audit_actor_role_is_lowercase',
            'audit_request_is_named',
            'audit_staff_names_capability',
            'audit_capability_is_dotted',
            'audit_impersonation_is_staff_only',
            'audit_impersonation_names_a_different_target',
            'audit_impersonation_names_the_subject',
            'audit_diff_is_bounded',
            'audit_diff_is_a_json_document',
            'audit_reason_is_bounded',
        ],
    ];

    /**
     * Apply Audit's storage constraints to a store.
     */
    public static function apply(InMemoryStore $store): void
    {
        $store->enforceAppendOnly(self::APPEND_ONLY_TABLES);
        $store->enforceUnique(self::UNIQUE_INDEXES);
    }
}
