-- NasTech Market — Catalogue module (taxonomy, attributes, prohibitions, locations)
--
-- ==========================================================================
-- SCHEMA NAME — READ THIS BEFORE THE REST OF THE FILE
-- ==========================================================================
-- This module is `Catalogue`. The obvious schema name for it is `catalogue`, and that
-- name is already taken: migration 001_money_path.sql does `CREATE SCHEMA catalogue`
-- and creates `catalogue.listings` inside it — the *Listings* module's table, under the
-- name that belongs, in 03-nastech-market.modules.dot and in
-- config/module-boundaries.php, to a different module. 001 and 002 are not edited by
-- this migration, so Catalogue takes a distinct schema name: **`taxonomy`**.
--
-- Why `taxonomy` and not `catalog`, `catalogue_ref`, `refdata`:
-- * `catalog` differs from `catalogue` by one letter. Two live schemas whose names are
--   an edit distance of 1 apart is a grant written against the wrong one, waiting to
--   happen. Rejected.
-- * `taxonomy` is the module's own subject. config/module-boundaries.php already uses
--   the word as the module's public meaning — the Search edge reads
--   "facets come from the taxonomy, not from whatever strings sellers typed", and the
--   Listings edge reads "a listing is only valid against a real category and its
--   attributes". Naming the schema after the word the architecture already uses for the
--   module costs nothing to learn.
-- * The location reference is in this schema too, which reads oddly next to the name.
--   It is deliberate: the rule from php-rules.md is one schema per *owning module*, not
--   one per aggregate. Splitting venues into `taxonomy_locations` would make one
--   module's invariants span two schemas for a cosmetic gain in noun accuracy.
--
-- FOR THE CONTROLLER: the underlying defect is in 001, not here. `catalogue.listings`
-- is Listings' table in a schema named after a module that does not own it, and
-- `SharedKernel\Persistence\Schema::TABLES` carries that mapping as
-- `'listings' => 'catalogue.listings'`. The clean fix is to rename 001's schema to
-- `listings` and let Catalogue have `catalogue`, which is a two-line change in 001,
-- 002 and Schema::TABLES plus this file. That rename is a decision about someone else's
-- migration, so it is escalated rather than taken here. Nothing in this file depends on
-- which way that decision goes, apart from the qualified names.
--
-- ==========================================================================
-- STATE
-- ==========================================================================
-- Written against src/Catalogue/Schema.php. NOT EXECUTED: no PostgreSQL and no PDO
-- driver in this environment. Three tests stand in for running it, and they are not the
-- same as running it:
--   tests/Catalogue/CatalogueDdlTest.php
--       the migration and Catalogue\Schema declare the same tables, columns, named row
--       rules, unique indexes, append-only triggers, invariant triggers and grants;
--   tests/Catalogue/CatalogueRowsSatisfyTheDdlChecksTest.php
--       every row the module actually writes is fed through every CHECK on its table via
--       tests/Support/DdlRowChecks.php, which raises rather than guessing on any
--       construct it cannot read;
--   tests/Catalogue/CatalogueInvariantsTest.php
--       the six cross-record rules are proved at commit time, including writes that
--       bypass the commands.
-- `psql -v ON_ERROR_STOP=1` against a real cluster, then each invariant violated from
-- psql directly, remains a required gate before deploy. The gist exclusion below has the
-- same open status it does in 001: btree_gist is created there, before this file runs.
--
-- ==========================================================================
-- WHAT THIS MODULE IS
-- ==========================================================================
-- Configuration with a lifecycle, not a lookup table somebody edits by hand. Four
-- aggregates: the category taxonomy (with immutable, digested versions and the pin that
-- binds a listing to one of them), the attribute definitions (types and mandatory
-- units), the prohibited-item ruleset (data, with a reason and an effective date), and
-- the handover location reference for one city.
--
-- Catalogue has no outbound edges. Nothing here references another module's schema, and
-- there is deliberately no foreign key out of this file: `listing_id` on the pin table
-- points at a row this module may not read. The pin exists because the Listings module
-- calls a Catalogue command to register it (the Listings -> Catalogue edge), which is
-- also why the pin carries its own digest rather than a join.
--
-- Idempotence: none. Runs once, inside a transaction, after 001 and 002.

BEGIN;

-- ==========================================================================
-- Schema
-- ==========================================================================
CREATE SCHEMA taxonomy;

COMMENT ON SCHEMA taxonomy IS
    'Catalogue module: the category taxonomy, attribute definitions, prohibited-item ruleset and the one-city handover location reference. Owns nothing outside itself; listings live in 001''s catalogue schema.';

-- ==========================================================================
-- Vocabularies, as data rather than as constants scattered in handlers
-- ==========================================================================
-- The pilot category is pre-owned watches. Every one of these value sets is mirrored by
-- a PHP enum or class constant, and tests/Catalogue/CatalogueDdlTest.php refuses any
-- drift between the two, in both directions: a value the DDL rejects that the code can
-- produce (the first write fails in production), and a value the DDL admits that no code
-- can interpret (a row nobody can render).

-- ==========================================================================
-- taxonomy.attribute_definitions
-- ==========================================================================
-- An attribute is a *question the platform asks a seller*. The type is what makes the
-- answer machine-checkable, and the unit is what makes it comparable. A "water
-- resistance: 10" with no unit is either 10 bar, 10 metres or 10 minutes of attention,
-- and a buyer cannot tell which — which is the failure the pilot category is most
-- exposed to, because a watch that is not waterproof is sold as one that is.

CREATE TABLE taxonomy.attribute_definitions (
    id              text PRIMARY KEY,
    -- Stable machine key. Lowercase and underscored so it survives being pasted into a
    -- query, a CSV export and a facet URL without changing shape.
    code            text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
    display_name    text NOT NULL CHECK (length(btrim(display_name)) > 0),
    -- Transcribed from NasTech\Catalogue\Attribute\AttributeType. A seventh type is a
    -- decision: it needs a cast rule, a unit rule and a rendering, all of which live in
    -- PHP, and none of which this column can supply on its own.
    data_type       text NOT NULL CHECK (data_type IN (
                        'integer_range', 'enum', 'boolean', 'length_mm', 'money_cents', 'date_service'
                    )),
    -- Nullable, and NULL means exactly one thing: this type is not a quantity, so there
    -- is no unit to state. Every unit-bearing type has a NOT NULL rule below, so a NULL
    -- here can never be an omission that passed three-valued logic by accident.
    unit            text,
    -- Nullable: only an `enum` has an option list, and `enum_options_are_mandatory`
    -- refuses the combination that would render an attribute with no answers to pick.
    option_codes    jsonb,
    -- Nullable: only `integer_range` carries bounds, and
    -- `range_bounds_belong_to_a_range` refuses bounds on any other type. An unbounded
    -- range is allowed (lower/upper each nullable) because "no upper bound" is a real
    -- thing to say about a price expectation.
    lower_bound     bigint,
    upper_bound     bigint,
    -- Who is standing behind the value. This is the column that keeps the pilot honest:
    -- NasTech does not put a watch on a pressure bench, so a water-resistance figure is
    -- a seller's statement, and `stated_value_carries_a_disclaimer` below makes it
    -- impossible to configure that attribute without also carrying the sentence that
    -- says so. A disclaimer that is only in the front-end copy is a disclaimer the next
    -- category ships without.
    provenance      text NOT NULL CHECK (provenance IN ('STATED_BY_SELLER', 'MEASURED_BY_PLATFORM')),
    -- Nullable, and NULL means "not required", which for MEASURED_BY_PLATFORM is the
    -- truthful case: the number needs no hedge because the platform produced it.
    disclaimer      text,
    guidance_text   text,
    state           text NOT NULL DEFAULT 'LIVE'
                        CHECK (state IN ('DRAFT', 'LIVE', 'RETIRED')),
    -- Optimistic CAS, the same pattern as orders.orders. A definition is edited by staff
    -- while other staff publish versions against it; see taxonomy.assert_revision_monotonic
    -- and the meaning-freeze trigger below the tables.
    revision        integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at      timestamptz NOT NULL DEFAULT now(),
    retired_at      timestamptz,

    -- ---- the unit invariants -------------------------------------------------
    -- A unit-bearing type defined without a unit is the whole "40 means what?" bug, so
    -- it is refused by the storage engine and not only by the constructor.
    --
    -- Every rule below that tests a nullable column spells out the IS NOT NULL half. A
    -- CHECK whose result is NULL is satisfied in PostgreSQL, so
    -- `data_type <> 'length_mm' OR unit = 'mm'` would pass on a length with no unit at
    -- all — three-valued logic turning the tightening into nothing. Written out, and
    -- tested both ways by CatalogueRowsSatisfyTheDdlChecksTest.
    CONSTRAINT unit_is_mandatory_where_the_type_demands_one CHECK (
        (data_type <> 'length_mm' AND data_type <> 'money_cents' AND data_type <> 'integer_range')
        OR unit IS NOT NULL
    ),
    -- `length_mm` is the type that exists *because* of this constraint: a length is
    -- millimetres or it is not a length in this schema. Millimetres are the unit the
    -- watch trade quotes in, and an inch-entered case size rounds to a different number.
    CONSTRAINT length_is_millimetres CHECK (
        data_type <> 'length_mm' OR (unit IS NOT NULL AND unit = 'mm')
    ),
    -- Money is integer cents plus an ISO code; the code lives in the unit column here
    -- because a cents amount without a currency is the same class of ambiguity as a
    -- length without a scale. Single-currency launch, matching shared.rand_currency.
    CONSTRAINT money_cents_carries_a_currency CHECK (
        data_type <> 'money_cents' OR (unit IS NOT NULL AND unit = 'ZAR')
    ),
    -- A range needs its scale named. `bar` is water resistance, `m` is depth, `g` is
    -- weight, `count` and `years` are the two service-history counts. Inventing a scale
    -- here is allowed by nothing but this list, which is the point.
    CONSTRAINT integer_range_names_a_scale CHECK (
        data_type <> 'integer_range'
        OR (unit IS NOT NULL AND unit IN ('bar', 'm', 'count', 'years', 'g'))
    ),
    -- The three non-quantity types must NOT carry a unit, or "unit" stops meaning
    -- anything: a boolean with unit 'yes' is how a facet ends up with two spellings of
    -- the same answer. NULL is required here, not permitted.
    CONSTRAINT boolean_has_no_unit CHECK (data_type <> 'boolean' OR unit IS NULL),
    CONSTRAINT enum_has_no_unit CHECK (data_type <> 'enum' OR unit IS NULL),
    -- A service date is a calendar day, not a quantity: no unit, and no time component
    -- either (that half is AttributeValue's rule, because CHECK cannot read a date).
    CONSTRAINT date_service_has_no_unit CHECK (data_type <> 'date_service' OR unit IS NULL),

    -- ---- shape invariants ----------------------------------------------------
    -- An enum with no options is an attribute that can never be answered.
    CONSTRAINT enum_options_are_mandatory CHECK (
        data_type <> 'enum'
        OR (option_codes IS NOT NULL AND jsonb_typeof(option_codes) = 'array')
    ),
    -- The other direction: option codes belong to one type only, so a range cannot grow
    -- a secret vocabulary that a facet reads while the validator ignores.
    CONSTRAINT option_codes_belong_to_an_enum CHECK (data_type = 'enum' OR option_codes IS NULL),
    -- An inverted range refuses every value, which is a silent "this category cannot be
    -- listed" rather than an error anybody sees. Half-bounded ranges are allowed — one
    -- NULL bound makes this NULL, and NULL satisfies a CHECK, which is the intended
    -- reading of "no ceiling on this expectation".
    CONSTRAINT range_bounds_are_ordered CHECK (data_type <> 'integer_range' OR lower_bound < upper_bound),
    -- Bounds only ever mean something for a range; a money_cents attribute with
    -- lower_bound = 5 is a bug wearing a number.
    CONSTRAINT range_bounds_belong_to_a_range CHECK (
        data_type = 'integer_range' OR (lower_bound IS NULL AND upper_bound IS NULL)
    ),
    -- A stated value must carry the sentence that says it was stated. This is the
    -- water-resistance invariant in DDL form: the qualifier is a column, so a listing
    -- cannot render "10 bar" without also being able to render "as stated by the seller;
    -- not tested by NasTech".
    CONSTRAINT stated_value_carries_a_disclaimer CHECK (
        provenance <> 'STATED_BY_SELLER'
        OR (disclaimer IS NOT NULL AND length(btrim(disclaimer)) > 0)
    )
);

COMMENT ON COLUMN taxonomy.attribute_definitions.provenance IS
    'STATED_BY_SELLER is the launch default for every physical property of a pre-owned watch, because the platform has no instrument. Widening this to MEASURED_BY_PLATFORM requires the measurement to exist somewhere in this codebase before the column allows the claim.';

COMMENT ON COLUMN taxonomy.attribute_definitions.disclaimer IS
    'Rendered next to the value, on the listing and in a dispute. Mandatory when provenance is STATED_BY_SELLER, by the named CHECK above, so "nobody tested it" is configuration rather than a code comment somebody will delete.';

-- ==========================================================================
-- taxonomy.categories
-- ==========================================================================
-- The mutable half of the taxonomy: a category is a lifecycle (DRAFT -> LIVE ->
-- RETIRED | MERGED) that points at whichever of its versions new listings are accepted
-- against. The version it points at is a separate, immutable row, so a category can move
-- forward without the listing that was created under the old one losing its vocabulary.

CREATE TABLE taxonomy.categories (
    id                  text PRIMARY KEY,
    slug                text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9_]{1,40}$'),
    name                text NOT NULL CHECK (length(btrim(name)) > 0),
    -- Nullable: a root category (the pilot's "watches") has no parent. The hierarchy is
    -- one level deep at launch and this column does not enforce that; Category::addChild
    -- does, because a depth rule is a rule about the whole tree and no single row can
    -- see it.
    parent_id           text,
    state               text NOT NULL DEFAULT 'DRAFT'
                            CHECK (state IN ('DRAFT', 'LIVE', 'RETIRED', 'MERGED')),
    -- Nullable while DRAFT: a category that has never published a version cannot accept
    -- a listing, and `live_category_has_a_current_version` below refuses the state where
    -- that would be unclear.
    current_version_id  text,
    -- Nullable, and required for every state but DRAFT: a decommissioned category is a
    -- forwarding pointer, and a category that closes without saying where its listings go
    -- is the stranding this module exists to refuse. Shared by RETIRE and MERGE because
    -- the promise is the same one — nothing is left pointing at a category that is gone.
    successor_category_id text,
    retirement_reason   text,
    revision            integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at          timestamptz NOT NULL DEFAULT now(),
    retired_at          timestamptz,

    CONSTRAINT live_category_has_a_current_version CHECK (state = 'DRAFT' OR current_version_id IS NOT NULL),
    CONSTRAINT decommissioned_category_names_a_successor CHECK (
        (state <> 'RETIRED' AND state <> 'MERGED') OR successor_category_id IS NOT NULL
    ),
    -- A self-successor is a forwarding pointer that never terminates: every resolver that
    -- walks successor_category_id loops, and the listing at the end of it is stranded
    -- twice.
    CONSTRAINT category_is_not_its_own_successor CHECK (
        successor_category_id IS NULL OR successor_category_id <> id
    ),
    -- Retiring something that never had a version means there is no frozen vocabulary for
    -- the listings that already exist, which is the stranding case in its cleanest form.
    -- Written without NOT IN because this file's CHECKs stay readable by
    -- tests/Support/DdlRowChecks.php, which refuses constructs it cannot model.
    CONSTRAINT decommissioned_category_had_a_version CHECK (
        (state <> 'RETIRED' AND state <> 'MERGED') OR current_version_id IS NOT NULL
    ),
    -- A retirement is a decision with a reason, or it is an outage with a ticket number.
    -- The IS NOT NULL half is load-bearing: retirement_reason is nullable, and a CHECK
    -- that evaluates to NULL is satisfied.
    CONSTRAINT decommission_states_a_reason CHECK (
        (state <> 'RETIRED' AND state <> 'MERGED')
        OR (retirement_reason IS NOT NULL AND length(btrim(retirement_reason)) > 0)
    )
);

-- ==========================================================================
-- taxonomy.category_versions — the immutable half
-- ==========================================================================
-- One row is one frozen question set: the attribute codes, their types, their units,
-- their option lists and their bounds, copied into `bindings` at publish time. There is
-- no UPDATE path to this table from any direction:
--   * the app role is not granted UPDATE (see the grants at the bottom),
--   * a BEFORE UPDATE OR DELETE trigger refuses the attempt anyway, for the psql session
--     that is not the app role,
--   * no command in the module has a method that edits a version, so "editing an
--     attribute set" is only expressible as publishing a successor version,
--   * and InMemoryStore refuses the write in tests, which is how the invariant is
--     observable at all in this environment.
-- The point of freezing the definition into the version, rather than joining to
-- attribute_definitions, is the dispute: six months from now the definition may be
-- RETIRED, renamed, or have had its disclaimer reworded by legal. The claim a buyer saw
-- was the one the version holds, and `frozen_vocabulary_digest_is_reproducible` (proved
-- by CatalogueInvariants, not by CHECK, because it needs to recompute a hash) is what
-- stops the frozen copy from being quietly rewritten by anyone who can reach the row.

CREATE TABLE taxonomy.category_versions (
    id              text PRIMARY KEY,
    category_id     text NOT NULL,
    -- One version number per category. Publishing twice at the same number is either a
    -- race or a handler that did not read the current one; the unique index below is
    -- what refuses it, because a pre-check has a window and an index does not.
    number          integer NOT NULL CHECK (number >= 1),
    -- The frozen question set: [{attribute_id, code, display_name, data_type, unit,
    -- option_codes, lower_bound, upper_bound, provenance, disclaimer, mandatory,
    -- display_order, guidance}]. An array, because the order is the form's order.
    bindings        jsonb NOT NULL CHECK (jsonb_typeof(bindings) = 'array'),
    -- Redundant with jsonb_array_length(bindings) on purpose: the narrow CHECK evaluator
    -- this schema is tested against cannot model jsonb_array_length, and a count the
    -- database can compare is worth one extra column. CatalogueInvariants re-derives it
    -- from the bindings and refuses the row when the two disagree, so the redundancy
    -- cannot drift.
    binding_count   integer NOT NULL CHECK (binding_count >= 0),
    -- sha256 over the canonical binding set, lowercase hex, fixed width.
    attribute_digest text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT version_asks_at_least_one_question CHECK (binding_count > 0),
    -- A digest is only evidence if it is a digest: fixed width, lowercase hex. Same
    -- guard 001 puts on pin_hash, for the same reason — a column that is supposed to be
    -- a hash will otherwise accept a human's placeholder.
    CONSTRAINT frozen_vocabulary_digest_is_fixed_width CHECK (attribute_digest ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE taxonomy.category_versions IS
    'Append-only. A listing pins one of these rows, and a dispute reads the claims as they were made. Re-running a published vocabulary is what the successor version is for; editing a published one is what this table refuses.';

CREATE UNIQUE INDEX versions_number_once_per_category
    ON taxonomy.category_versions (category_id, number);

-- ==========================================================================
-- taxonomy.listing_category_pins — the claims a listing made
-- ==========================================================================
-- The pin is written by the Catalogue side when Listings registers a listing against a
-- version (the Listings -> Catalogue edge), not by a join into the listings table, which
-- this module is not allowed to read. Two digests travel with it:
--   * attribute_digest — copied from the pinned version, so a dispute can prove the
--     version the listing was created against is still byte-identical to what it was;
--   * answers_digest  — over the seller's answers as canonicalised by the *frozen*
--     binding set, so the answers a listing holds can be checked against the claims the
--     listing made, without this module owning the answers themselves.
--
-- APPEND-ONLY, and keyed by (listing_id, number): a seller editing what a listing says
-- does not overwrite the earlier claim, it adds one. That is the difference between a
-- dispute that can answer "what did this listing say in March, when the buyer saw it" and
-- one that can only answer "what does it say now". The unique index on the pair is also
-- the race guard: two concurrent re-pins both read max(number)=3, both write 4, and the
-- index refuses one of them. A pre-check would have a window; an index does not.
--
-- A retirement or a merge therefore moves NO pin row. The pin keeps pointing at the
-- immutable version it was made against — that is what "a dispute reads the claims
-- actually made" means — and what moves is the category's own forwarding pointer to its
-- successor. The pre-flight in RetireCategory and MergeCategories is what proves that
-- pointer carries every affected listing's claims before the category row is touched.

CREATE TABLE taxonomy.listing_category_pins (
    id                  text PRIMARY KEY,
    listing_id          text NOT NULL,
    -- 1 for the original claim set, 2 for the first edit. Never reused, never updated.
    number              integer NOT NULL CHECK (number >= 1),
    -- Denormalised from the version on purpose: it is part of the record of what was
    -- claimed, and it gives invariant 1 two independently written ids to disagree about.
    category_id         text NOT NULL,
    category_version_id text NOT NULL,
    attribute_digest    text NOT NULL,
    answers_digest      text NOT NULL,
    -- Nullable: only the first pin of a listing has no predecessor.
    prior_pin_id        text,
    pinned_at           timestamptz NOT NULL,

    CONSTRAINT pin_attribute_digest_is_fixed_width CHECK (attribute_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT pin_answers_digest_is_fixed_width CHECK (answers_digest ~ '^[0-9a-f]{64}$'),
    -- The two digests must not be the same string: a handler that digested the answers
    -- twice would pass every equality check a dispute can run.
    CONSTRAINT pin_digests_are_two_different_facts CHECK (attribute_digest <> answers_digest),
    -- A claim cannot be its own predecessor. Cheap, and it is the mistake a re-pin makes
    -- when it is written from the wrong row.
    CONSTRAINT re_pin_does_not_point_at_itself CHECK (prior_pin_id IS NULL OR prior_pin_id <> id),
    CONSTRAINT pin_names_a_category_and_a_version CHECK (category_id <> category_version_id)
);

-- One pin per number per listing, and the number is the only ordering the claim history
-- needs. This is the race guard described above; the "which pin is current" question is
-- max(number), which is why there is no is_current column to keep in step.
CREATE UNIQUE INDEX pins_one_number_per_listing
    ON taxonomy.listing_category_pins (listing_id, number);

CREATE INDEX pins_by_version ON taxonomy.listing_category_pins (category_version_id);

-- ==========================================================================
-- taxonomy.prohibited_item_rules
-- ==========================================================================
-- The prohibited-item ruleset as data. The alternative that this replaces is a
-- hardcoded array in a controller, which has three failures: no reason is recorded, so a
-- seller's appeal cannot be answered; there is no effective date, so a rule added last
-- Tuesday silently invalidates a listing created last month; and the rule cannot be
-- repealed, only deleted, which destroys the evidence of what was decided when.
--
-- Retroactivity is refused by the shape of the data rather than by a convention: a rule
-- only ever applies to a listing created at or after effective_from (see
-- ProhibitedItemRuleBook::evaluate, which takes the instant), and the trigger below
-- refuses any UPDATE that moves effective_from backwards. A rule cannot reach into the
-- past, because the column that would do it is frozen.

CREATE TABLE taxonomy.prohibited_item_rules (
    id              text PRIMARY KEY,
    rule_code       text NOT NULL UNIQUE CHECK (rule_code ~ '^[a-z][a-z0-9_]{1,40}$'),
    -- What the rule looks at. A title-only rule can ban a category by accident; a
    -- category-only rule cannot ban one stolen serial number inside a legal listing.
    scope           text NOT NULL CHECK (scope IN ('CATEGORY', 'TITLE', 'CATEGORY_AND_TITLE')),
    -- Nullable: a platform-wide rule (counterfeit markings, wildlife products, a stolen
    -- serial) belongs to no category. NULL is required for those, and
    -- `prohibition_names_a_category_when_it_scopes_one` refuses the opposite mistake —
    -- a CATEGORY-scoped rule with no category, which would silently ban everything.
    category_id     text,
    -- Lowercased, trimmed, at least three characters. The length floor is a rule, not
    -- hygiene: a one-character pattern in a substring ruleset removes the catalogue.
    pattern         text NOT NULL CHECK (pattern = lower(pattern)),
    reason          text NOT NULL,
    severity        text NOT NULL DEFAULT 'REFUSE' CHECK (severity IN ('REFUSE', 'WARN')),
    effective_from  timestamptz NOT NULL,
    -- Nullable: NULL means open-ended, which is the normal case for a prohibition.
    effective_to    timestamptz,
    repealed_by     text,
    revision        integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT prohibition_reason_is_mandatory CHECK (length(btrim(reason)) > 0),
    -- A pattern shorter than three characters is not a rule, it is a wildcard.
    CONSTRAINT prohibition_pattern_is_specific CHECK (length(btrim(pattern)) >= 3),
    -- An empty window means the rule never applied, which is a repeal written as an
    -- activation and read by nobody as either.
    CONSTRAINT prohibition_window_is_not_empty CHECK (effective_to IS NULL OR effective_from < effective_to),
    CONSTRAINT prohibition_names_a_category_when_it_scopes_one CHECK (scope <> 'CATEGORY' OR category_id IS NOT NULL),
    -- A repeal records who repealed it and why, in the column that says so, rather than
    -- by deleting the row and leaving the dataset unable to answer what was prohibited on
    -- the day the listing was created. The IS NOT NULL half is not decoration: repealed_by
    -- is nullable, and a NULL-valued CHECK is a satisfied CHECK.
    CONSTRAINT prohibition_repeal_is_attributed CHECK (
        effective_to IS NULL
        OR (repealed_by IS NOT NULL AND length(btrim(repealed_by)) > 0)
    )
);

COMMENT ON COLUMN taxonomy.prohibited_item_rules.effective_from IS
    'Immutable after insert, by taxonomy.forbid_retroactive_prohibition. This is the column that would make a rule retroactive, so it is the column the database freezes.';

-- ==========================================================================
-- taxonomy.cities / distance_bands / suburbs
-- ==========================================================================
-- The location reference for ONE city, and the DDL says so out loud rather than leaving
-- it to the seed script. This mirrors the argument shared.rand_currency makes in 001: a
-- single-value domain is not a limitation someone forgot to lift, it is a promise the
-- rest of the schema is allowed to rest on. Distance bands, suburb assignments and the
-- opening-hours edge cases (a venue open Tue-Sat only, a venue closed for a public
-- holiday) have only been thought through for Johannesburg; admitting a second city row
-- here would put unexamined rules in front of a second city's sellers.

CREATE TABLE taxonomy.cities (
    id          text PRIMARY KEY,
    code        text NOT NULL UNIQUE,
    name        text NOT NULL CHECK (length(btrim(name)) > 0),
    province    text NOT NULL CHECK (length(btrim(province)) > 0),
    -- Storage is UTC; the edge renders SAST (UTC+2). The zone is carried per city
    -- because "opens at 09:00" is meaningless without it, and a handover is a meeting at
    -- a time in a place.
    tz          text NOT NULL DEFAULT 'Africa/Johannesburg' CHECK (tz = 'Africa/Johannesburg'),
    revision    integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at  timestamptz NOT NULL DEFAULT now(),

    -- The one-city invariant, in the storage engine. Widening this is a schema change,
    -- not a config change: bands, suburb assignments and the safety advisories below are
    -- all derived for the pilot city and none of them has been re-examined for another.
    CONSTRAINT only_the_pilot_city_is_seeded CHECK (code = 'JHB')
);

COMMENT ON TABLE taxonomy.cities IS
    'Exactly one row at launch, enforced by only_the_pilot_city_is_seeded. Handover venues, suburbs and distance bands all hang off it.';

-- Distance bands are what a buyer filters on ("meet within 5 km"), and the band *is* the
-- filter vocabulary. Two bands covering 4 km is two answers to one filter, and the
-- exclusion constraint below is the same shape as commissions.policies' overlapping
-- window rule — same failure (nobody can say what one input resolves to), same fix.
CREATE TABLE taxonomy.distance_bands (
    id          text PRIMARY KEY,
    city_id     text NOT NULL,
    code        text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
    label       text NOT NULL CHECK (length(btrim(label)) > 0),
    -- Whole kilometres. Half-hearted precision here (metres, or a numeric with a scale)
    -- is how a "within 5 km" filter and a "within 5 km" label disagree.
    from_km     integer NOT NULL,
    -- Nullable: the outer band ("rest of the metro") has no ceiling. NULL is the last
    -- band's shape, not an omission, and band_window_is_ordered handles the three-valued
    -- case by refusing only a comparison it can make.
    to_km       integer,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT band_floor_is_not_negative CHECK (from_km >= 0),
    CONSTRAINT band_window_is_ordered CHECK (to_km IS NULL OR from_km < to_km),
    -- Half-open [from, to): a changeover at exactly 5 km needs no gap and no overlap,
    -- which is the same reasoning as the commission policy window in 001.
    CONSTRAINT bands_do_not_overlap EXCLUDE USING gist (
        city_id WITH =,
        numrange(from_km, to_km, '[)') WITH &&
    )
);

CREATE UNIQUE INDEX band_code_is_unique_per_city
    ON taxonomy.distance_bands (city_id, code);

-- A suburb is where the meeting actually happens, and its band is what makes the filter
-- honest. `safety_advisory` is nullable because it is area colour, not a venue's own
-- notice; the mandatory safety text lives on the venue, where the buyer is going.
CREATE TABLE taxonomy.suburbs (
    id              text PRIMARY KEY,
    city_id         text NOT NULL,
    code            text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
    name            text NOT NULL CHECK (length(btrim(name)) > 0),
    -- Nullable is NOT allowed for the assignment: a suburb outside every band disappears
    -- from a distance filter while its venues still render, which is a silent hole in the
    -- one screen the buyer uses to choose where to meet.
    band_code       text NOT NULL,
    safety_advisory text,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT suburb_band_is_named CHECK (length(btrim(band_code)) > 0)
);

CREATE UNIQUE INDEX suburb_code_is_unique_per_city
    ON taxonomy.suburbs (city_id, code);

-- ==========================================================================
-- taxonomy.handover_venues / venue_hours / venue_transport
-- ==========================================================================
-- The data the buyer's and the seller's screens render, and nothing else. There is
-- deliberately no column here about *who* may meet *whom*: no permitted seller, no
-- buyer eligibility, no risk score against a person. That decision belongs to Safety and
-- Identity; a venue table that grew an `allowed_user_ids` column would be a second owner
-- of a rule it cannot see. tests/Catalogue/HandoverLocationTest.php names the columns
-- this table must not gain, and fails if they appear.

CREATE TABLE taxonomy.handover_venues (
    id              text PRIMARY KEY,
    city_id         text NOT NULL,
    suburb_code     text NOT NULL,
    code            text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
    name            text NOT NULL CHECK (length(btrim(name)) > 0),
    -- Nullable: a mall atrium has no street number, and "Ground floor, next to the
    -- security desk" is the address that actually gets somebody to the meeting.
    address_line    text,
    -- Mandatory. A handover of a R40 000 watch at an unlit location is the incident this
    -- column exists to prevent, and it is the reason the column cannot be left blank by
    -- whoever is pasting a venue in.
    safety_note     text NOT NULL,
    -- About the place, never about the parties: STANDARD is a public indoor venue,
    -- POLICE_STATION is a venue with a SAPS counter, HIGH_VALUE is a venue the platform
    -- suggests for watches above a threshold the *listing* sets.
    risk_band       text NOT NULL DEFAULT 'STANDARD'
                        CHECK (risk_band IN ('STANDARD', 'POLICE_STATION', 'HIGH_VALUE')),
    state           text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'CLOSED', 'REMOVED')),
    revision        integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at      timestamptz NOT NULL DEFAULT now(),
    closed_at       timestamptz,

    CONSTRAINT venue_safety_note_is_mandatory CHECK (length(btrim(safety_note)) > 0),
    CONSTRAINT venue_is_in_a_named_suburb CHECK (length(btrim(suburb_code)) > 0),
    -- A CLOSED venue must record when, so that a dispute can answer "was this place open
    -- the evening of the handover" without an archaeology session. Nullable because an
    -- OPEN venue has none, which is the normal case.
    CONSTRAINT closed_venue_states_when CHECK (state <> 'CLOSED' OR closed_at IS NOT NULL)
);

CREATE UNIQUE INDEX venue_code_is_unique_per_city
    ON taxonomy.handover_venues (city_id, code);

-- One row per weekday. `is_open = false` is a real answer — a venue shut on Sundays is
-- information, and "no row" would be indistinguishable from "nobody recorded it".
CREATE TABLE taxonomy.venue_hours (
    id          text PRIMARY KEY,
    venue_id    text NOT NULL,
    -- 0 = Monday, through 6 = Sunday. Written out rather than inferred, because a
    -- handover arranged against a column whose day numbering nobody agreed is how two
    -- people arrive on different days.
    weekday     integer NOT NULL,
    is_open     boolean NOT NULL,
    -- Nullable exactly when is_open = false, which venue_open_day_has_times enforces; the
    -- three-valued case (open, no times) is a venue that is open at no time.
    opens_at    text,
    closes_at   text,
    created_at  timestamptz NOT NULL DEFAULT now(),

    -- BETWEEN is not usable here: tests/Support/DdlRowChecks.php raises on constructs it
    -- cannot model, and an unreadable CHECK is an unverified one.
    CONSTRAINT venue_day_is_valid CHECK (weekday >= 0 AND weekday <= 6),
    CONSTRAINT venue_open_day_has_times CHECK (
        is_open = false OR (opens_at IS NOT NULL AND closes_at IS NOT NULL)
    ),
    -- Cross-midnight opening is refused rather than modelled as two rows: a watch
    -- handover after midnight is not a thing the pilot supports, and the alternative is a
    -- "open from 22:00 to 01:00" that renders as a venue that never closes.
    CONSTRAINT venue_hours_window_is_ordered CHECK (
        is_open = false OR (opens_at < closes_at)
    ),
    -- A closed day must not carry times, or the screen has to guess which half to trust.
    CONSTRAINT venue_closed_day_has_no_times CHECK (
        is_open = true OR (opens_at IS NULL AND closes_at IS NULL)
    )
);

CREATE UNIQUE INDEX venue_has_one_row_per_weekday
    ON taxonomy.venue_hours (venue_id, weekday);

-- How each party gets there, and how far they then walk. A venue with no transport line
-- is a venue whose listing card cannot answer "can I get there without a car", which in
-- this city is most buyers.
CREATE TABLE taxonomy.venue_transport (
    id            text PRIMARY KEY,
    venue_id      text NOT NULL,
    line_code     text NOT NULL,
    station       text NOT NULL,
    -- Whole minutes from the platform to the meeting point, capped at an hour. A "walk"
    -- of 180 minutes is a different journey being recorded in the wrong column, and the
    -- buyer is the one who finds out.
    walk_minutes  integer NOT NULL,
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT venue_transport_line_is_named CHECK (length(btrim(line_code)) > 0),
    CONSTRAINT venue_transport_station_is_named CHECK (length(btrim(station)) > 0),
    CONSTRAINT venue_transport_walk_is_reachable CHECK (walk_minutes >= 0 AND walk_minutes <= 60)
);

CREATE UNIQUE INDEX venue_transport_line_is_unique_per_station
    ON taxonomy.venue_transport (venue_id, line_code, station);

-- ==========================================================================
-- Revision monotonicity: CAS at the storage layer
-- ==========================================================================
-- The same reason orders.orders has it: a stale aggregate cannot overwrite a newer row,
-- even by code that forgot to compare. Catalogue's writes race in the ordinary case — two
-- staff publishing versions against one category, a repeal landing while a rule is being
-- edited, a merge running against a venue being closed for a holiday.
--
-- One generic function over the five mutable tables, rather than five copies, because the
-- rule is identical and 001's own lesson is that a rule written per-table drifts. It is
-- NOT shared.forbid_row_mutation() (which refuses all mutation) and it is NOT
-- shared.assert_order_version_monotonic() — that function names orders in its message,
-- and a trigger that reports the wrong table is worse than no trigger.
--
-- listing_category_pins and category_versions are absent on purpose: they are append-only
-- below, so there is no UPDATE for a monotonicity check to police. Adding either of them
-- here would be a grant mistake dressed up as a concurrency fix.

CREATE FUNCTION taxonomy.assert_revision_monotonic() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.revision <= OLD.revision THEN
        RAISE EXCEPTION '% row % saved at revision %, which does not advance the stored revision %',
            TG_TABLE_NAME, OLD.id, NEW.revision, OLD.revision
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER categories_revision_monotonic
    BEFORE UPDATE ON taxonomy.categories
    FOR EACH ROW EXECUTE FUNCTION taxonomy.assert_revision_monotonic();

CREATE TRIGGER attributes_revision_monotonic
    BEFORE UPDATE ON taxonomy.attribute_definitions
    FOR EACH ROW EXECUTE FUNCTION taxonomy.assert_revision_monotonic();

CREATE TRIGGER prohibitions_revision_monotonic
    BEFORE UPDATE ON taxonomy.prohibited_item_rules
    FOR EACH ROW EXECUTE FUNCTION taxonomy.assert_revision_monotonic();

CREATE TRIGGER venues_revision_monotonic
    BEFORE UPDATE ON taxonomy.handover_venues
    FOR EACH ROW EXECUTE FUNCTION taxonomy.assert_revision_monotonic();

CREATE TRIGGER cities_revision_monotonic
    BEFORE UPDATE ON taxonomy.cities
    FOR EACH ROW EXECUTE FUNCTION taxonomy.assert_revision_monotonic();

-- ==========================================================================
-- Immutability triggers
-- ==========================================================================
-- 1. A published vocabulary never changes. category_versions is append-only in full:
--    the frozen binding set IS the claim a listing was made against. 001's
--    shared.forbid_row_mutation() is reused rather than copied: it is the general
--    "this table is evidence" refusal, the shared schema is explicitly depended on by
--    every module and depends on none, and a second copy of the message is a second
--    thing to keep in sync.

CREATE TRIGGER category_versions_append_only
    BEFORE UPDATE OR DELETE ON taxonomy.category_versions
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- 2. A definition's MEANING never changes. Its type, its unit, its option list, its
--    bounds and its code are already quoted by published versions and digested by pins;
--    changing them in place would leave every pin claiming a meaning the row no longer
--    has. Only the label, the guidance, the state and the revision may move.
--    This is a partial immutability, so it needs its own function: the append-only
--    trigger above refuses all UPDATE, which would forbid a retirement.
CREATE FUNCTION taxonomy.forbid_definition_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code
       OR NEW.data_type IS DISTINCT FROM OLD.data_type
       OR NEW.unit IS DISTINCT FROM OLD.unit
       OR NEW.option_codes IS DISTINCT FROM OLD.option_codes
       OR NEW.lower_bound IS DISTINCT FROM OLD.lower_bound
       OR NEW.upper_bound IS DISTINCT FROM OLD.upper_bound
       OR NEW.provenance IS DISTINCT FROM OLD.provenance THEN
        RAISE EXCEPTION 'attribute definition % is already digested by published category versions: its code, type, unit, options, bounds and provenance are frozen (attempted rewrite of one of them)',
            OLD.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER attribute_definitions_meaning_is_frozen
    BEFORE UPDATE ON taxonomy.attribute_definitions
    FOR EACH ROW EXECUTE FUNCTION taxonomy.forbid_definition_rewrite();

-- 3. A prohibition cannot be made retroactive. effective_from, pattern, scope, category
--    and reason are the rule as it was decided; the only legal edit is closing the
--    window, and only forward. Without this, a staff member who wants yesterday's listing
--    gone can move effective_from back one day and the listing is now illegal — which
--    destroys the promise the whole ruleset-as-data design is built on.
CREATE FUNCTION taxonomy.forbid_retroactive_prohibition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.pattern IS DISTINCT FROM OLD.pattern
       OR NEW.scope IS DISTINCT FROM OLD.scope
       OR NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.rule_code IS DISTINCT FROM OLD.rule_code
       OR NEW.reason IS DISTINCT FROM OLD.reason THEN
        RAISE EXCEPTION 'prohibited-item rule % cannot be rewritten: a rule that changes after the fact '
            'retroactively invalidates listings that were legal when they were created',
            OLD.id USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.effective_to IS NOT NULL AND (NEW.effective_to IS NULL OR NEW.effective_to < OLD.effective_to) THEN
        RAISE EXCEPTION 'prohibited-item rule % is already repealed as of %; a repeal may be corrected later, never backwards onto a listing that relied on the earlier window',
            OLD.id, OLD.effective_to USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER prohibited_item_rules_are_forward_looking
    BEFORE UPDATE ON taxonomy.prohibited_item_rules
    FOR EACH ROW EXECUTE FUNCTION taxonomy.forbid_retroactive_prohibition();

-- ==========================================================================
-- The catalogue invariants, at commit time
-- ==========================================================================
-- CatalogueInvariants::check() in PHP, and the same rules here as deferred constraint
-- triggers, for the transactions that never reach the PHP — a repair script, a psql
-- session, a reporting job reading these tables. Deferred because these are cross-record
-- rules: a merge legitimately moves the pin before it flips the category state, and a
-- per-statement check would refuse the first write and no legal ordering of the writes
-- would satisfy it.

-- 1. A pin points at a published version OF THE CATEGORY IT NAMES. A pin carrying a
--    version from a different category means the listing claimed answers to questions it
--    was never asked.
CREATE FUNCTION taxonomy.invariant_pin_points_at_own_published_version() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_category text;
BEGIN
    SELECT cv.category_id INTO v_category
      FROM taxonomy.category_versions cv WHERE cv.id = NEW.category_version_id;
    IF v_category IS NULL THEN
        RAISE EXCEPTION 'pin % points at category version %, which does not exist. A listing cannot be pinned to a vocabulary that is not there.',
            NEW.id, NEW.category_version_id USING ERRCODE = 'check_violation';
    END IF;
    IF v_category <> NEW.category_id THEN
        RAISE EXCEPTION 'pin % names category % but version % belongs to %. The claims a listing makes are the claims that version asks about.',
            NEW.id, NEW.category_id, NEW.category_version_id, v_category
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.attribute_digest <> (SELECT cv.attribute_digest FROM taxonomy.category_versions cv WHERE cv.id = NEW.category_version_id) THEN
        RAISE EXCEPTION 'pin % carries a vocabulary digest that its version does not recognise. The frozen question set has been rewritten, or the pin was made against something else.',
            NEW.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_pin_points_at_own_published_version
    AFTER INSERT OR UPDATE ON taxonomy.listing_category_pins
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION taxonomy.invariant_pin_points_at_own_published_version();

-- 2. No listing is stranded. A pin may not point at a version belonging to a category
--    that has been retired or merged: the merge/retirement command is required to move
--    every affected pin first, and this trigger is what refuses the run that did not.
CREATE FUNCTION taxonomy.invariant_no_pin_on_decommissioned_category() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    stranded integer;
BEGIN
    IF NEW.state NOT IN ('RETIRED', 'MERGED') THEN
        RETURN NULL;
    END IF;
    SELECT count(*) INTO stranded
      FROM taxonomy.listing_category_pins p
      JOIN taxonomy.category_versions cv ON cv.id = p.category_version_id
     WHERE cv.category_id = NEW.id;
    IF stranded > 0 THEN
        RAISE EXCEPTION 'category % is % with % listing pin(s) still pointing at its versions. Nothing was stranded on the way here: the retirement is incomplete, not the listing.',
            NEW.id, NEW.state, stranded USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_no_pin_on_decommissioned_category
    AFTER INSERT OR UPDATE OF state ON taxonomy.categories
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION taxonomy.invariant_no_pin_on_decommissioned_category();

-- 3. A live category points at a published version of itself, so the next listing gets a
--    real vocabulary. DRAFT categories are exempt; that is what DRAFT means.
CREATE FUNCTION taxonomy.invariant_current_version_is_own() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_category text;
BEGIN
    IF NEW.state = 'DRAFT' THEN
        RETURN NULL;
    END IF;
    SELECT cv.category_id INTO v_category
      FROM taxonomy.category_versions cv WHERE cv.id = NEW.current_version_id;
    IF v_category IS NULL OR v_category <> NEW.id THEN
        RAISE EXCEPTION 'category % is % but its current version % belongs to % — a listing accepted against this category would be pinned to another category''s claims.',
            NEW.id, NEW.state, NEW.current_version_id, COALESCE(v_category, '(nothing)')
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_current_version_is_own
    AFTER INSERT OR UPDATE OF state, current_version_id ON taxonomy.categories
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION taxonomy.invariant_current_version_is_own();

-- 4. A published version asks questions that exist. Every binding must name an attribute
--    definition that is not DRAFT, checked at publish — after that the version is
--    append-only, so the binding set can never name something that stops existing.
CREATE FUNCTION taxonomy.invariant_version_bindings_are_defined() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    b jsonb;
    v_state text;
BEGIN
    FOR b IN SELECT jsonb_array_elements(NEW.bindings) LOOP
        SELECT a.state INTO v_state
          FROM taxonomy.attribute_definitions a
         WHERE a.id = (b ->> 'attribute_id');
        IF v_state IS NULL THEN
            RAISE EXCEPTION 'category version % binds attribute %, which this module has never defined. The listing would ask a question with no rule behind it.',
                NEW.id, COALESCE(b ->> 'attribute_id', '(null)') USING ERRCODE = 'check_violation';
        END IF;
        IF v_state = 'DRAFT' THEN
            RAISE EXCEPTION 'category version % binds draft attribute %. A published vocabulary cannot depend on a definition somebody is still writing.',
                NEW.id, b ->> 'attribute_id' USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_version_bindings_are_defined
    AFTER INSERT ON taxonomy.category_versions
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION taxonomy.invariant_version_bindings_are_defined();

-- 5. A rule that scopes a category names one that exists. A typo in category_id is a
--    prohibition that forbids nothing while reading like a prohibition.
CREATE FUNCTION taxonomy.invariant_prohibition_scope_is_real() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_id text;
BEGIN
    IF NEW.category_id IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT c.id INTO v_id FROM taxonomy.categories c WHERE c.id = NEW.category_id;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'prohibited-item rule % scopes category %, which does not exist. The rule forbids nothing, and the next reviewer will read it as if it forbade something.',
            NEW.id, NEW.category_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_prohibition_scope_is_real
    AFTER INSERT OR UPDATE OF category_id ON taxonomy.prohibited_item_rules
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION taxonomy.invariant_prohibition_scope_is_real();

-- 6. A venue is usable or it is not registered: at least one open day, at least one
--    transport line, and a suburb that belongs to the same city as the venue. A venue
--    with no open day cannot be booked; a venue in a suburb of another city has a
--    distance band that means nothing.
CREATE FUNCTION taxonomy.invariant_venue_is_usable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    open_days   integer;
    lines       integer;
    v_city      text;
BEGIN
    IF NEW.state = 'REMOVED' THEN
        RETURN NULL;
    END IF;
    SELECT count(*) INTO open_days FROM taxonomy.venue_hours h
        WHERE h.venue_id = NEW.id AND h.is_open = true;
    IF open_days = 0 THEN
        RAISE EXCEPTION 'venue % has no open day. A handover location the buyer cannot book a time at is a placeholder, not a location.',
            NEW.id USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO lines FROM taxonomy.venue_transport t
        WHERE t.venue_id = NEW.id;
    IF lines = 0 THEN
        RAISE EXCEPTION 'venue % has no transport line. "How do I get there" is the question the venue card exists to answer.',
            NEW.id USING ERRCODE = 'check_violation';
    END IF;
    SELECT s.city_id INTO v_city FROM taxonomy.suburbs s
        WHERE s.code = NEW.suburb_code AND s.city_id = NEW.city_id;
    IF v_city IS NULL THEN
        RAISE EXCEPTION 'venue % is in suburb %, which is not a suburb of its city. The distance band the venue inherits would be another city''s.',
            NEW.id, NEW.suburb_code USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_venue_is_usable
    AFTER INSERT OR UPDATE ON taxonomy.handover_venues
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION taxonomy.invariant_venue_is_usable();

-- 7. A suburb's band exists in its own city. A band code that is not one of the city's
--    bands is a suburb that vanishes from the distance filter.
CREATE FUNCTION taxonomy.invariant_suburb_band_is_real() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_id text;
BEGIN
    SELECT b.id INTO v_id FROM taxonomy.distance_bands b
        WHERE b.code = NEW.band_code AND b.city_id = NEW.city_id;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'suburb % is assigned to band %, which is not a band of its city. Suburbs outside every band disappear from a distance filter while their venues still render.',
            NEW.id, NEW.band_code USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_suburb_band_is_real
    AFTER INSERT OR UPDATE ON taxonomy.suburbs
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION taxonomy.invariant_suburb_band_is_real();

COMMIT;

-- ==========================================================================
-- Grants — the least privilege this module's code actually needs
-- ==========================================================================
-- Follows 002's shape: per table, never TRUNCATE, never DDL, no DELETE on anything that
-- is evidence or that a listing depends on. Roles nastech_app and nastech_owner already
-- exist; nothing here creates them.
--
-- The load-bearing asymmetry: category_versions is INSERT-only for the app role, because
-- an immutable vocabulary whose UPDATE privilege depends on a trigger alone is immutable
-- only until someone writes the migration that forgets the trigger. Everything mutable
-- here gets SELECT/INSERT/UPDATE and no DELETE — a retired category, a repealed rule and
-- a closed venue all stay in the dataset, because the question a dispute asks is about a
-- date, and a deleted row cannot answer it.

GRANT USAGE ON SCHEMA taxonomy TO nastech_app;
GRANT USAGE ON SCHEMA taxonomy TO nastech_owner;

GRANT SELECT, INSERT ON taxonomy.category_versions TO nastech_app;

GRANT SELECT, INSERT, UPDATE ON
    taxonomy.attribute_definitions,
    taxonomy.categories,
    taxonomy.listing_category_pins
TO nastech_app;

-- Reference data: the app role reads the ruleset and the locations, and writes them
-- through the authoring commands only.
GRANT SELECT, INSERT, UPDATE ON
    taxonomy.prohibited_item_rules,
    taxonomy.cities,
    taxonomy.distance_bands,
    taxonomy.suburbs,
    taxonomy.handover_venues,
    taxonomy.venue_hours,
    taxonomy.venue_transport
TO nastech_app;

-- DELETE is withheld from every table in this schema. A withdrawn category version, a
-- repealed rule and a closed venue are all answers to a question about a date; the state
-- column is where that answer lives, not the row's presence.
--
-- The invariant triggers above are SECURITY INVOKER (Postgres' default) and read only
-- within taxonomy, which is why nothing here reaches into another module's schema and why
-- no cross-module SELECT is granted.

GRANT SELECT ON ALL TABLES IN SCHEMA taxonomy TO nastech_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA taxonomy GRANT SELECT ON TABLES TO nastech_app;

-- ==========================================================================
-- Deliberately NOT in this file
-- ==========================================================================
-- * Foreign keys out of taxonomy. listing_category_pins.listing_id references nothing,
--   on purpose: an FK into catalogue.listings (001's schema, the Listings module's table)
--   would make two modules' schemas one schema and make Catalogue — the module with no
--   outbound edges in the graph — the owner of a dependency the graph denies. The pin's
--   own digests plus invariant 1 are the substitute, and they are stronger: an FK proves a
--   row exists, not that the claims it made still match.
-- * Second-city support, and anything about who may meet whom. See the notes above.
-- * Full-text or fuzzy matching for prohibited patterns. The ruleset is substring data
--   with an effective date here; matching policy (normalisation, transliteration,
--   homoglyph handling) is a decision with its own failure modes and does not belong in
--   a CHECK.
-- * The seed data for the watch pilot. The categories, the four attributes, the
--   prohibited rules and the Johannesburg venues are inserted through the module's own
--   commands by tests/Catalogue/CatalogueFixture.php, so that the seeded configuration is
--   the configuration the code can prove. An INSERT-based seed would let a rule with no
--   reason into the table, which is the one thing this migration refuses.
