<?php

declare(strict_types=1);

namespace NasTech\Media;

use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Schema as SharedSchema;

/**
 * Media's constraints, as data.
 *
 * The counterpart of db/migrations/003_media.sql: the same tables, the same unique
 * indexes, the same named row rules, declared once here so the in-memory store can
 * enforce them and once there so PostgreSQL does. tests/Media/MediaDdlTest.php
 * compares the two in both directions, and tests/Media/MediaRowsSatisfyTheDdlChecksTest.php
 * feeds the rows this module really writes through every CHECK in the migration.
 *
 * Read the file before relaxing anything in it. `evidence_is_never_published` and
 * `only_a_verified_digest_leaves_staged` are not column hygiene; they are the two
 * promises the module was built to keep.
 */
final class Schema
{
    /**
     * @var array<string, string> table => "schema.table"
     */
    public const TABLES = [
        'media_assets' => 'media.assets',
        'media_digest_verifications' => 'media.digest_verifications',
    ];

    /**
     * The column set, in migration order.
     *
     * The money path derives its columns by running the path and reading what it
     * inserted, which is right for it and wrong here: SqlMediaRepository writes an
     * explicit column list into an INSERT, so a column that exists only in the DDL
     * would be silently unpopulated and a column that exists only in PHP would fail
     * on the first deploy. One list, three users — MediaRecord::toArray(), the SQL,
     * and the migration.
     *
     * @var list<string>
     */
    public const ASSET_COLUMNS = [
        'id',
        'owner_account_id',
        'purpose',
        'state',
        'sha256',
        'storage_key',
        'size_bytes',
        'mime',
        'width_px',
        'height_px',
        'colour_profile',
        'source_device',
        'capture_station',
        'retention_class',
        'retention_reason',
        'rendition_kind',
        'lod_tier',
        'source_asset_id',
        'digest_verified',
        'version',
        'created_at',
        'verified_at',
        'published_at',
        'retired_at',
        'reject_reason',
        'retirement_reason',
        'erasure_requested_at',
        'purge_after_at',
    ];

    /** @var list<string> */
    public const VERIFICATION_COLUMNS = [
        'id',
        'asset_id',
        'declared_sha256',
        'observed_sha256',
        'result',
        'observed_at',
        'observed_by',
    ];

    /**
     * Rows that are evidence. A verification is a fact about a moment in time: it
     * is answered by another verification, never edited.
     *
     * media.assets is deliberately absent — state moves, so the row is mutable — and
     * that absence is what the version trigger and the no-delete-of-evidence trigger
     * are there to police instead.
     *
     * @var list<string>
     */
    public const APPEND_ONLY_TABLES = [
        'media_digest_verifications',
    ];

    /**
     * @var array<string, list<string>> table => index definitions (columns joined with +)
     */
    public const UNIQUE_INDEXES = [
        // The brief's headline constraint, exactly: (sha256, rendition_kind,
        // lod_tier) cannot be inserted twice.
        //
        // Both columns are nullable — a source record carries neither, because
        // inventing a 'NONE' sentinel would put a token on the wire that no frontend
        // can interpret — and PostgreSQL treats NULLs as distinct in a unique index,
        // so the migration declares this one as a partial index over the rendition
        // rows. The in-memory store skips a record whose indexed columns contain a
        // NULL for the same reason, which is the model agreeing with the DDL rather
        // than approximating it.
        //
        // Source rows are deduplicated by the primary key instead, which MediaId
        // derives from (owner, digest); see the note there for why a source upload is
        // per-account while a rendition is global.
        'media_assets' => ['sha256+rendition_kind+lod_tier'],
        'media_digest_verifications' => ['asset_id+result'],
    ];

    /**
     * The row rules Media reasons about, by PostgreSQL name.
     *
     * Only the decisions. A column's own hygiene — the sha256 shape, size_bytes > 0,
     * the enumerated vocabularies — stays inline and unnamed in the migration and is
     * proved against real rows instead.
     *
     * @var array<string, list<string>> "schema.table" => list of constraint names
     */
    public const ROW_CHECKS = [
        'media.assets' => [
            'only_a_verified_digest_leaves_staged',
            'evidence_is_never_published',
            'evidence_is_never_transient',
            'evidence_says_where_it_was_shot',
            'purge_never_scheduled_on_evidence',
            'rendition_has_both_halves',
            'rendition_hangs_off_a_source',
            'a_source_hangs_off_nothing',
            'a_record_is_not_its_own_source',
            'retention_reason_is_mandatory',
            'a_rejection_says_why',
            'a_retirement_says_why',
            'dimensions_come_in_pairs',
        ],
        'media.digest_verifications' => [
            'a_mismatch_names_different_bytes',
            'a_verification_names_its_observer',
        ],
    ];

    /**
     * Rules that cannot be a CHECK because they span rows or rewrite a column, and
     * so are triggers. Listed here so a parity test can require each one to exist in
     * the migration: an unattached trigger reads exactly like an enforced rule when
     * the file is skimmed.
     *
     * @var array<string, list<string>> table => trigger names
     */
    public const TRIGGER_RULES = [
        'media_assets' => [
            'assets_version_monotonic',
            'assets_key_follows_digest',
            'assets_evidence_row_cannot_be_deleted',
        ],
        'media_digest_verifications' => [
            'digest_verifications_append_only',
        ],
    ];

    /**
     * Install Media's rules on a store.
     *
     * Merged with SharedKernel's rather than replacing them, because
     * InMemoryStore::enforceAppendOnly()/enforceUnique() take a whole-store list and
     * assignment, not an addition: a module that applied its own schema alone would
     * quietly strip append-only from the ledger. A seam worth knowing about before
     * the third module shares a store — the note is in this module's README, and the
     * store API is not this module's to change.
     */
    public static function apply(InMemoryStore $store): void
    {
        $store->enforceAppendOnly(array_values(array_unique(
            [...self::APPEND_ONLY_TABLES, ...SharedSchema::APPEND_ONLY_TABLES],
        )));

        $unique = SharedSchema::UNIQUE_INDEXES;
        foreach (self::UNIQUE_INDEXES as $table => $indexes) {
            $unique[$table] = array_values(array_unique(
                [...($unique[$table] ?? []), ...$indexes],
            ));
        }
        $store->enforceUnique($unique);
    }

    private function __construct()
    {
    }
}
