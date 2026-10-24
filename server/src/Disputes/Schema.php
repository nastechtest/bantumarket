<?php

declare(strict_types=1);

namespace NasTech\Disputes;

use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Schema as SharedSchema;

/**
 * The Disputes constraints, as data — the same shape `SharedKernel\Persistence\Schema`
 * declares for the money path, and read by the same style of test.
 *
 * Why this module keeps its own file rather than adding to the shared one: `Schema` is
 * the money path's declaration, `tests/Persistence/SchemaParityTest.php` is written
 * against it and asserts its exact table count. A second module editing it would be a
 * second module changing somebody else's gate. What is shared is the *convention*, and
 * the merge in `apply()` below is what makes the two lists coexist in the one store this
 * environment has.
 *
 * Schema `disputes`, tables owned by this module only. Nothing here names another
 * module's table: the order is read through `Orders\OrderRepository`, the listing through
 * `Listings\ListingRepository`, and the ledger through the outbox instruction — never
 * through a `SELECT`.
 */
final class Schema
{
    /**
     * @var array<string, string> in-memory table => "schema.table"
     */
    public const TABLES = [
        DisputeCase::TABLE => 'disputes.dispute_cases',
        ConditionRecord::SNAPSHOT_TABLE => 'disputes.dispute_condition_snapshots',
        Claim::TABLE => 'disputes.dispute_claims',
        DisputeDecision::TABLE => 'disputes.dispute_decisions',
        EvidenceReference::TABLE => 'disputes.dispute_evidence',
        DisputeEvent::TABLE => 'disputes.dispute_case_events',
    ];

    /**
     * Evidence tables. A decision, a claim, an attachment, a condition snapshot and a
     * timeline entry are all things that *happened*, and a case that can be re-written
     * after the fact is a case that cannot be defended to either party.
     *
     * `dispute_cases` is deliberately absent: it is the live aggregate, its money pointer
     * and its SLA clock have to move, and it is protected by optimistic CAS plus the
     * monotonic-version trigger instead. The rule is not "nothing in Disputes changes";
     * the rule is "nothing that was decided changes".
     *
     * @var list<string>
     */
    public const APPEND_ONLY_TABLES = [
        ConditionRecord::SNAPSHOT_TABLE,
        Claim::TABLE,
        DisputeDecision::TABLE,
        EvidenceReference::TABLE,
        DisputeEvent::TABLE,
    ];

    /**
     * @var array<string, list<string>> table => list of index definitions (columns joined with +)
     */
    public const UNIQUE_INDEXES = [
        // The retry-after-timeout claim: the same deliberate tap twice is the same request.
        DisputeCase::TABLE => ['idempotency_key', 'order_id+open_slot'],
        Claim::TABLE => ['case_id+kind'],
        ConditionRecord::SNAPSHOT_TABLE => ['case_id+sequence'],
        DisputeDecision::TABLE => ['case_id+sequence', 'idempotency_key'],
        EvidenceReference::TABLE => ['case_id+media_id'],
        DisputeEvent::TABLE => ['case_id+sequence', 'idempotency_key'],
    ];

    /**
     * The row rules that are decisions rather than column hygiene, by PostgreSQL name.
     *
     * Read them as the module's constitution: `only_disputable_states_are_admitted` is the
     * central honesty rule of the product written as a constraint, and
     * `unadjudicable_needs_escalation` is the epistemic boundary. Both exist here as well
     * as in PHP because the PHP version only binds on transactions that go through the PHP.
     *
     * @var array<string, list<string>>
     */
    public const ROW_CHECKS = [
        'disputes.dispute_cases' => [
            'lifecycle_state_is_known',
            'only_disputable_states_are_admitted',
            'claim_scope_is_a_contract_value',
            'severity_is_the_caption_vocabulary',
            'reason_code_is_canonical',
            'opened_by_is_a_party',
            'awaiting_is_a_named_side',
            'open_slot_names_the_order',
            'live_slot_only_while_live',
            'instructed_refund_within_ceiling',
            'residual_is_ceiling_less_instructed',
            'case_statement_is_readable',
            'escalation_needs_code_and_note',
        ],
        'disputes.dispute_condition_snapshots' => [
            'snapshot_scope_is_a_contract_value',
            'first_snapshot_is_at_open',
            'snapshot_fingerprint_is_a_digest',
            'changed_fields_is_a_field_list',
        ],
        'disputes.dispute_claims' => [
            'adjudicable_matches_the_kind',
            'claim_summary_is_readable',
        ],
        'disputes.dispute_decisions' => [
            'refund_within_order_hold',
            'full_refund_is_the_whole_authority',
            'partial_refund_leaves_a_residual',
            'no_action_moves_nothing',
            'authority_is_the_hold_less_what_preceded',
            'unadjudicable_needs_escalation',
            'decision_reasoning_is_mandatory',
            'decision_actor_is_named',
            'money_moved_has_an_instruction',
        ],
        'disputes.dispute_evidence' => [
            'evidence_bytes_are_positive',
            'evidence_is_a_supported_file_type',
        ],
        'disputes.dispute_case_events' => [
            'event_kind_is_known',
            'event_body_is_readable',
            'money_booked_event_is_money_bearing',
        ],
    ];

    /**
     * Install this module's constraints on a store that may already be carrying the money
     * path's.
     *
     * `Store::enforceUnique()` and `enforceAppendOnly()` *replace* the installed lists, so
     * naively applying the Disputes lists after the money path's would silently drop the
     * ledger's uniqueness and make `./bin/test` green while a replayed webhook double-paid a
     * seller. The merge is the whole reason this method exists rather than two constant
     * lookups at the call site.
     */
    public static function apply(InMemoryStore $store): void
    {
        $store->enforceAppendOnly([
            ...SharedSchema::APPEND_ONLY_TABLES,
            ...self::APPEND_ONLY_TABLES,
        ]);

        $store->enforceUnique(SharedSchema::UNIQUE_INDEXES + self::UNIQUE_INDEXES);
    }

    /**
     * The migration text, read from disk. Public because the DDL tests are the only things
     * that prove these declarations and the SQL agree, and they need the same file.
     */
    public static function migrationPath(): string
    {
        return dirname(__DIR__, 2) . '/db/migrations/007_disputes.sql';
    }

    public static function migration(): string
    {
        $contents = @file_get_contents(self::migrationPath());
        if ($contents === false) {
            throw new \RuntimeException('Disputes migration is missing: ' . self::migrationPath());
        }

        return $contents;
    }
}
