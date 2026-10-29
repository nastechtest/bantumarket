<?php

declare(strict_types=1);

namespace NasTech\Search;

use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Schema as SharedSchema;

/**
 * The search index's constraints, as data.
 *
 * 011_search.sql declares the same lists. tests/Search/SearchDdlTest compares
 * them in both directions and feeds rows written by a real rebuild through every
 * CHECK. The column list is the module's most important rule: it is closed, it
 * contains no personal field, and both the table and the result view are checked
 * against it.
 *
 * The index row is mutable by design — a newer source version replaces it. The
 * evidence that the projection was built from a particular source state is
 * `source_version` on each row, not an append-only event log.
 */
final class Schema
{
    public const SCHEMA = 'search';

    /**
     * @var array<string, string> bare table => "schema.table"
     */
    public const TABLES = [
        'search_documents' => 'search.documents',
    ];

    /**
     * The public projection, in the order the result view selects it. `indexed_at`
     * is bookkeeping and is absent: it says when the index wrote a row, not what
     * the row shows.
     *
     * @var list<string>
     */
    public const DOCUMENT_COLUMNS = [
        'id',
        'title',
        'category_path',
        'price_cents',
        'condition',
        'seller_tier',
        'has_photo',
        'has_3d',
        'has_video',
        'active',
        'published_at',
        'source_version',
    ];

    /**
     * The result table also carries `indexed_at`. No other column exists; in
     * particular there is no seller_id, seller_name, phone, email, address or
     * location column, and the DDL test fails if one appears.
     *
     * @var list<string>
     */
    public const DOCUMENT_TABLE_COLUMNS = [
        ...self::DOCUMENT_COLUMNS,
        'indexed_at',
    ];

    /**
     * The index is a projection, not evidence: a rebuild overwrites rows rather
     * than appending a second copy. Nothing here is append-only.
     *
     * @var list<string>
     */
    public const APPEND_ONLY_TABLES = [];

    /**
     * `id` is the primary key, so there is no second unique index to drift from
     * it.
     *
     * @var array<string, list<string>>
     */
    public const UNIQUE_INDEXES = [];

    /**
     * @var array<string, list<string>> "schema.table" => constraint names
     */
    public const ROW_CHECKS = [
        'search.documents' => [
            'title_is_present',
            'category_path_is_a_slug_path',
            'price_is_not_negative',
            'condition_is_known',
            'seller_tier_is_known',
            'source_version_is_positive',
        ],
    ];

    /**
     * A version may not go backwards. A CHECK cannot see OLD, so this one is a
     * trigger rather than a row constraint.
     *
     * @var array<string, list<string>>
     */
    public const TRIGGER_RULES = [
        'search_documents' => ['search_documents_source_version_monotonic'],
    ];

    /**
     * Merge with SharedKernel's lists rather than replacing them: the store takes
     * whole-store lists, and a module that applied only its own would strip the
     * ledger's append-only rule.
     */
    public static function apply(InMemoryStore $store): void
    {
        $store->enforceAppendOnly(array_values(array_unique([
            ...self::APPEND_ONLY_TABLES,
            ...SharedSchema::APPEND_ONLY_TABLES,
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

    private function __construct()
    {
    }
}
