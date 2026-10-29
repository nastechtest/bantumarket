<?php

declare(strict_types=1);

namespace NasTech\Safety;

use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Schema as SharedSchema;

/**
 * Safety's constraints, as data.
 *
 * The migration (008_safety.sql) declares the same lists. tests/Safety/
 * SafetyDdlTest compares them in both directions and feeds the rows a real
 * Safety path writes through every CHECK with tests/Support/DdlRowChecks.php;
 * a rule here without a row there is a rule production does not enforce.
 *
 *   - blocks and sanction_decisions are append-only. A block is answered by
 *     the pair never being written again (the unique index is the idempotency),
 *     and a sanction is answered by another decision row, never an edit.
 *   - (blocker_id, blocked_id) is unique: a retried block is one block.
 *   - (sanction_id, decision) is unique: one proposal and one approval.
 *   - the sanction CHECKs carry maker-checker: a proposed restraint has no
 *     checker, an applied one names a different account.
 */
final class Schema
{
    public const SCHEMA = 'safety';

    /**
     * @var array<string, string> in-memory table => "schema.table"
     */
    public const TABLES = [
        InMemorySafetyRepository::REPORT_TABLE => 'safety.reports',
        InMemorySafetyRepository::BLOCK_TABLE => 'safety.blocks',
        InMemorySafetyRepository::SANCTION_TABLE => 'safety.sanctions',
        InMemorySafetyRepository::DECISION_TABLE => 'safety.sanction_decisions',
    ];

    /**
     * Evidence rows. A block cannot be edited into an unblock and a decision
     * cannot be rewritten after the sanction moved; the reports and sanctions
     * tables are the live aggregates and are mutable so their state can move.
     *
     * @var list<string>
     */
    public const APPEND_ONLY_TABLES = [
        InMemorySafetyRepository::BLOCK_TABLE,
        InMemorySafetyRepository::DECISION_TABLE,
    ];

    /** @var array<string, list<string>> table => index definitions (columns joined with +) */
    public const UNIQUE_INDEXES = [
        InMemorySafetyRepository::BLOCK_TABLE => ['blocker_id+blocked_id'],
        InMemorySafetyRepository::DECISION_TABLE => ['sanction_id+decision'],
    ];

    /**
     * Named decisions, by PostgreSQL constraint name. Column hygiene stays
     * inline in the migration; the rules a reviewer would quote are named.
     *
     * @var array<string, list<string>>
     */
    public const ROW_CHECKS = [
        'safety.reports' => [
            'report_reason_is_known',
            'report_subject_is_known',
            'report_state_is_known',
            'a_report_is_not_about_its_author',
            'a_report_names_its_subject',
            'report_body_is_readable',
            'report_body_has_no_identifier_number',
            'report_body_has_no_phone_number',
            'report_version_starts_positive',
        ],
        'safety.blocks' => [
            'a_block_is_not_self',
            'a_block_records_a_reason',
            'a_block_names_both_parties',
        ],
        'safety.sanctions' => [
            'sanction_action_is_known',
            'sanction_state_is_known',
            'a_sanction_records_a_reason',
            'a_sanction_names_its_target_and_maker',
            'sanction_expiry_is_after_it_was_raised',
            'a_proposed_sanction_awaits_a_second_actor',
            'an_applied_sanction_says_when',
            'a_sanction_is_not_self_checked',
            'a_warning_needs_one_actor_and_a_restraint_needs_two',
            'sanction_version_starts_positive',
        ],
        'safety.sanction_decisions' => [
            'decision_is_known',
            'decision_actor_role_is_known',
            'a_decision_names_the_role_that_made_it',
            'a_decision_records_a_reason',
            'a_decision_names_its_actor',
        ],
    ];

    /**
     * Rules that depend on TG_OP or run before an update, and so cannot be a
     * CHECK. Listed so the parity test requires each trigger to exist.
     *
     * @var array<string, list<string>>
     */
    public const TRIGGER_RULES = [
        InMemorySafetyRepository::REPORT_TABLE => ['safety_reports_version_monotonic'],
        InMemorySafetyRepository::BLOCK_TABLE => ['safety_blocks_append_only'],
        InMemorySafetyRepository::SANCTION_TABLE => ['safety_sanctions_version_monotonic'],
        InMemorySafetyRepository::DECISION_TABLE => ['safety_sanction_decisions_append_only'],
    ];

    /**
     * Merge with SharedKernel's lists rather than replacing them: the store
     * takes whole-store lists, and a module that applied only its own would
     * strip the ledger's append-only rule.
     */
    public static function apply(InMemoryStore $store): void
    {
        $store->enforceAppendOnly(array_values(array_unique([
            ...SharedSchema::APPEND_ONLY_TABLES,
            ...self::APPEND_ONLY_TABLES,
        ])));

        $unique = SharedSchema::UNIQUE_INDEXES;
        foreach (self::UNIQUE_INDEXES as $table => $indexes) {
            $unique[$table] = array_values(array_unique([
                ...($unique[$table] ?? []),
                ...$indexes,
            ]));
        }
        $store->enforceUnique($unique);
    }

    public static function migrationPath(): string
    {
        return dirname(__DIR__, 2) . '/db/migrations/008_safety.sql';
    }

    public static function migration(): string
    {
        $contents = @file_get_contents(self::migrationPath());
        if ($contents === false) {
            throw new \RuntimeException('Safety migration is missing: ' . self::migrationPath());
        }

        return $contents;
    }

    private function __construct()
    {
    }
}
