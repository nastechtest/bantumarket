<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Schema as SharedSchema;

/**
 * Catalogue's tables and rules, as data.
 *
 * The schema is `taxonomy`, not `catalogue`: 001_money_path.sql already created
 * `catalogue.listings` for the Listings module. This module models the four
 * aggregates the listing-validation rule needs: category lifecycle, immutable
 * category versions, attribute definitions and listing pins. The prohibited-item
 * ruleset and the one-city handover reference in 006 are deliberately outside
 * this file's declaration.
 *
 * tests/Catalogue/CatalogueDdlTest.php compares these lists with 006 in both
 * directions and feeds every row a real path writes through every CHECK using
 * tests/Support/DdlRowChecks.php.
 */
final class Schema
{
    public const SCHEMA = 'taxonomy';

    /**
     * @var array<string, string> in-memory table => "schema.table"
     */
    public const TABLES = [
        'catalogue_attribute_definitions' => 'taxonomy.attribute_definitions',
        'catalogue_categories' => 'taxonomy.categories',
        'catalogue_category_versions' => 'taxonomy.category_versions',
        'catalogue_listing_category_pins' => 'taxonomy.listing_category_pins',
    ];

    /**
     * Only the table with a BEFORE UPDATE OR DELETE trigger in 006. Pins are
     * append-only by repository shape and by the fact that no command updates
     * one; the DDL does not lock them with a trigger, and claiming it does would
     * make the parity test lie.
     *
     * @var list<string>
     */
    public const APPEND_ONLY_TABLES = [
        'catalogue_category_versions',
    ];

    /**
     * @var array<string, list<string>> table => index definitions (columns joined with +)
     */
    public const UNIQUE_INDEXES = [
        'catalogue_attribute_definitions' => ['code'],
        'catalogue_categories' => ['slug'],
        'catalogue_category_versions' => ['category_id+number'],
        'catalogue_listing_category_pins' => ['listing_id+number'],
    ];

    /**
     * Named decisions, by PostgreSQL constraint name. Inline column hygiene
     * (NOT NULL, a non-zero revision, a pattern) stays in the migration; the
     * rules a reviewer would quote in a dispute are named here.
     *
     * @var array<string, list<string>>
     */
    public const ROW_CHECKS = [
        'taxonomy.attribute_definitions' => [
            'unit_is_mandatory_where_the_type_demands_one',
            'length_is_millimetres',
            'money_cents_carries_a_currency',
            'integer_range_names_a_scale',
            'boolean_has_no_unit',
            'enum_has_no_unit',
            'date_service_has_no_unit',
            'enum_options_are_mandatory',
            'option_codes_belong_to_an_enum',
            'range_bounds_are_ordered',
            'range_bounds_belong_to_a_range',
            'stated_value_carries_a_disclaimer',
        ],
        'taxonomy.categories' => [
            'live_category_has_a_current_version',
            'decommissioned_category_names_a_successor',
            'category_is_not_its_own_successor',
            'decommissioned_category_had_a_version',
            'decommission_states_a_reason',
        ],
        'taxonomy.category_versions' => [
            'version_asks_at_least_one_question',
            'frozen_vocabulary_digest_is_fixed_width',
        ],
        'taxonomy.listing_category_pins' => [
            'pin_attribute_digest_is_fixed_width',
            'pin_answers_digest_is_fixed_width',
            'pin_digests_are_two_different_facts',
            're_pin_does_not_point_at_itself',
            'pin_names_a_category_and_a_version',
        ],
    ];

    /**
     * Row/state rules that need a trigger rather than a CHECK.
     *
     * @var array<string, list<string>>
     */
    public const TRIGGER_RULES = [
        'catalogue_attribute_definitions' => [
            'attributes_revision_monotonic',
            'attribute_definitions_meaning_is_frozen',
        ],
        'catalogue_categories' => [
            'categories_revision_monotonic',
        ],
        'catalogue_category_versions' => [
            'category_versions_append_only',
        ],
    ];

    /**
     * Cross-record rules proved by deferred constraint triggers in 006. The
     * service implements the same four checks, led by the merge pre-flight.
     *
     * @var list<string>
     */
    public const INVARIANT_TRIGGERS = [
        'invariant_pin_points_at_own_published_version',
        'invariant_no_pin_on_decommissioned_category',
        'invariant_current_version_is_own',
        'invariant_version_bindings_are_defined',
    ];

    /**
     * Merge with SharedKernel's lists rather than replacing them: the store
     * takes whole-store lists, and a module that applied only its own would
     * strip the ledger's append-only rule.
     */
    public static function apply(InMemoryStore $store): void
    {
        $store->enforceAppendOnly(array_values(array_unique([
            ...self::APPEND_ONLY_TABLES,
            ...SharedSchema::APPEND_ONLY_TABLES,
        ])));

        $unique = SharedSchema::UNIQUE_INDEXES;
        foreach (self::UNIQUE_INDEXES as $table => $definitions) {
            $unique[$table] = array_values(array_unique([
                ...($unique[$table] ?? []),
                ...$definitions,
            ]));
        }
        $store->enforceUnique($unique);
    }

    public static function migrationPath(): string
    {
        return dirname(__DIR__, 2) . '/db/migrations/006_catalogue.sql';
    }

    public static function migration(): string
    {
        $contents = @file_get_contents(self::migrationPath());
        if ($contents === false) {
            throw new \RuntimeException('Catalogue migration is missing: ' . self::migrationPath());
        }

        return $contents;
    }

    private function __construct()
    {
    }
}
