<?php

declare(strict_types=1);

namespace NasTech\Payouts;

use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Schema as SharedSchema;

/**
 * Payouts' tables and row rules, as data.
 *
 * The migration (db/migrations/014_payouts.sql) applies the same lists as DDL
 * and tests/Payouts/PayoutsDdlTest.php compares them in both directions — a
 * named rule missing here is a rule the PHP does not claim, and a rule here
 * without a CONSTRAINT is one production does not enforce.
 *
 * There is no APPEND_ONLY_TABLES entry: a batch has a lifecycle
 * (PREPARED → RELEASED or FAILED) and its lines gain their ledger pointers when
 * the money moves. What is evidence is not the mutable header but the two
 * ledger rows, and those live in Settlements, where nothing can edit them.
 */
final class Schema
{
    /**
     * @var array<string, string> bare table => "schema.table"
     */
    public const TABLES = [
        PayoutBatch::TABLE => 'payouts.payout_batches',
        PayoutLine::TABLE => 'payouts.payout_lines',
    ];

    /**
     * @var list<string>
     */
    public const APPEND_ONLY_TABLES = [];

    /**
     * Idempotency and no-double-pay, by index rather than by a pre-check.
     *
     * `payout_key` is the retry key for the whole batch. The line uniqueness
     * means one batch cannot contain the same order twice, which is the shape
     * of a duplicated row in whatever built the instruction.
     *
     * @var array<string, list<string>>
     */
    public const UNIQUE_INDEXES = [
        PayoutBatch::TABLE => ['payout_key'],
        PayoutLine::TABLE => ['batch_id+seller_id+order_id'],
    ];

    /**
     * The named row rules that are decisions, not column hygiene. Mirrored by
     * the named CONSTRAINTs in 014_payouts.sql and by PayoutsDdlTest.
     *
     * @var array<string, list<string>>
     */
    public const ROW_CHECKS = [
        'payouts.payout_batches' => [
            'batch_status_is_known',
            'batch_total_is_positive',
            'batch_key_is_not_blank',
            'preparer_is_named',
            'approver_is_not_the_maker',
            'released_batch_has_an_approver',
            'failed_batch_was_released_and_explained',
        ],
        'payouts.payout_lines' => [
            'line_amount_is_positive',
            'line_names_its_order',
            'masked_brand_is_known',
            'masked_last_four_is_four_digits',
            'reversal_follows_a_ledger_row',
        ],
    ];

    public static function apply(InMemoryStore $store): void
    {
        // Merge rather than replace: enforceUnique() is store-wide, and clobbering
        // the money path's indexes to add this module's would be a boundary
        // violation performed through an API instead of an import.
        $indexes = SharedSchema::UNIQUE_INDEXES;
        foreach (self::UNIQUE_INDEXES as $table => $columns) {
            $indexes[$table] = $columns;
        }
        $store->enforceUnique($indexes);
    }
}
