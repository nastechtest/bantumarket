<?php

declare(strict_types=1);

namespace NasTech\SharedKernel\Persistence;

/**
 * The constraints the money path depends on, declared in one place.
 *
 * These are not optimisations. Append-only ledger_entries and the unique index on
 * (provider, provider_event_id) are the two things that make a replayed webhook
 * and an edited ledger row impossible rather than merely unlikely, so they belong
 * next to each other and nowhere else. The PostgreSQL DDL in
 * db/migrations/001_money_path.sql applies the same lists as DDL, and
 * tests/Persistence/SchemaParityTest.php proves the two agree; a constraint missing
 * from this file is a constraint missing from production.
 */
final class Schema
{
    /**
     * Every table the money path writes, and the PostgreSQL schema-qualified name it
     * is created under.
     *
     * The PHP side is a bare name because the in-memory store is one flat namespace
     * and `handover_tokens` must not collide with another module's `tokens`. The SQL
     * side is qualified because the schemas are the module boundaries. This map is
     * the only place that knows both, which is what makes the parity test possible:
     * a table added in code without being added here fails the build instead of
     * failing at migration time.
     *
     * @var array<string, string> table => "schema.table"
     */
    public const TABLES = [
        'listings' => 'catalogue.listings',
        'orders' => 'orders.orders',
        'provider_events' => 'payments.provider_events',
        'seen_webhook_signatures' => 'payments.seen_webhook_signatures',
        'payment_discrepancies' => 'payments.payment_discrepancies',
        'commission_entries' => 'commissions.commission_entries',
        'ledger_entries' => 'settlements.ledger_entries',
        'payout_requests' => 'settlements.payout_requests',
        'handover_tokens' => 'handover.tokens',
        'outbox_messages' => 'shared.outbox_messages',
    ];
    /**
     * Rows that are evidence. Once written they are never edited, only answered
     * by a new row.
     *
     * outbox_messages is deliberately absent: the payload is fixed but
     * delivered_at is written by the dispatcher, so making the whole table
     * append-only would forbid the delivery bookkeeping that makes at-least-once
     * work. payment_discrepancies is absent for the same reason — a human closes
     * it. Both are still inserted inside the transaction that created them, which
     * is the invariant that actually protects the money.
     *
     * @var list<string>
     */
    public const APPEND_ONLY_TABLES = [
        'ledger_entries',
        'commission_entries',
        'provider_events',
        'seen_webhook_signatures',
        'payout_requests',
    ];

    /** @var array<string, list<string>> table => list of index definitions (columns joined with +) */
    public const UNIQUE_INDEXES = [
        'ledger_entries' => ['reversal_of'],
        'commission_entries' => ['order_id+kind'],
        'provider_events' => ['provider+provider_event_id'],
        'payout_requests' => ['idempotency_key'],
        'seen_webhook_signatures' => ['signature'],
    ];

    /**
     * The row rules the money path reasons about, by PostgreSQL name.
     *
     * Only the named ones. A column's own hygiene — NOT NULL, a non-negative amount,
     * a bounded rate — stays inline in the migration and is checked against real rows;
     * a rule that spans two columns or encodes a decision is the kind that gets quoted
     * in a dispute, so it gets a name and an entry here.
     *
     * Keyed by the qualified SQL name rather than the in-memory one because
     * commissions.policies has no in-memory counterpart: it is the table the money path
     * never writes, so no row will ever prove its rules and this list is the only thing
     * that does. Deleting one of these lines from the migration without deleting it
     * here fails SchemaParityTest; so does relaxing one.
     *
     * @var array<string, list<string>> "schema.table" => list of constraint names
     */
    public const ROW_CHECKS = [
        'orders.orders' => [
            'buyer_is_not_seller',
            'buyer_total_covers_item_price',
        ],
        'payments.payment_discrepancies' => [
            'discrepancy_is_real',
        ],
        'commissions.policies' => [
            'policy_cap_is_not_below_floor',
            'policy_window_is_not_empty',
            'policy_reason_is_mandatory',
        ],
        'commissions.commission_entries' => [
            'forward_net_is_gross_less_commission',
            'forward_has_no_parent',
            'reversal_has_a_parent',
            'commission_sign_follows_kind',
            'commission_evidence_has_money',
        ],
        'settlements.ledger_entries' => [
            'ledger_reason_is_mandatory',
        ],
        'handover.tokens' => [
            'attempts_lock_out_at_five',
            'pin_is_a_digest',
        ],
    ];

    public static function apply(InMemoryStore $store): void
    {
        $store->enforceAppendOnly(self::APPEND_ONLY_TABLES);
        $store->enforceUnique(self::UNIQUE_INDEXES);
    }
}
