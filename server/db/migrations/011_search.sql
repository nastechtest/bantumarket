-- NasTech Market — search index projection, PostgreSQL DDL (migration 011)
--
-- Owns schema `search`. Applies after 010; 011 is this module's slot. Written
-- against src/Search/Schema.php, SearchDocument.php and the enums PriceBucket,
-- Condition, SellerTier and SortKey. The parity test is
-- tests/Search/SearchDdlTest.php; like every migration in this tree this file has
-- not been run, because there is no PostgreSQL in this environment.
-- `psql -v ON_ERROR_STOP=1` remains the deploy gate.
--
-- WHAT THIS SCHEMA IS
-- A rebuildable projection of listing state. One row per listing: the title, the
-- taxonomy path, the price in cents, the condition grade, media presence, the
-- seller's verification tier, whether the listing is active, when it was
-- published, and the source version the row was built from. Search is not a
-- source of truth and no module reads this schema back.
--
-- WHY source_version IS ON EVERY ROW
-- A projection that cannot say which source state it saw cannot be repaired, only
-- trusted. The version makes staleness a comparison (indexed version < source
-- version), makes a replayed older event detectable and refusable (the trigger
-- below), and makes a rebuild idempotent (same version + same content = no write).
--
-- WHAT THIS SCHEMA MUST NEVER CARRY
-- No seller name, seller id, phone number, email address, street address, suburb,
-- city or exact location. A search result is the most widely read row in the
-- platform; contact and location data belongs to Identity, the order and the
-- handover record, where access is checked per party. The column list is closed,
-- `search.result_documents` exposes exactly the non-personal projection, and a
-- producer that sends a personal field is refused in PHP before a row exists.
-- The one remaining route — a phone number typed into the seller-authored title —
-- is refused at the projection boundary as well.
--
-- PRICE BUCKETS
-- The bucket ladder is not stored: it is derived from price_cents. Its edges are
-- the contract's PRICE_BUCKET_EDGES_CENTS (50 000, 100 000, 200 000, 270 000,
-- 500 000, 1 000 000 cents) and each upper bound is exclusive, so 50 000 belongs
-- to 500_1000. Storing a bucket column would create a second copy of that rule
-- that a price edit could contradict.

BEGIN;

CREATE SCHEMA search;

COMMENT ON SCHEMA search IS
    'Rebuildable projection of listing state for search. No personal data: no seller id, name, phone, email, address or location. Every row carries the source version it was built from.';

-- ==========================================================================
-- search.documents — the projection row
-- ==========================================================================

CREATE TABLE search.documents (
    -- The listing id, opaque. There is no separate listing_id column: a second
    -- copy of the identity is a second thing that can disagree with the key.
    id             text PRIMARY KEY,
    title          text NOT NULL,
    -- Taxonomy path, e.g. watches/pre-owned/divers. Slug segments only: a free
    -- string here would let two spellings of one category become two facets.
    category_path  text NOT NULL,
    price_cents    bigint NOT NULL,
    condition      text NOT NULL,
    seller_tier    text NOT NULL,
    has_photo      boolean NOT NULL,
    has_3d         boolean NOT NULL,
    has_video      boolean NOT NULL,
    -- Whether the listing is offered. An inactive row is retained as evidence
    -- that the listing was seen, but it never appears in a result page.
    active         boolean NOT NULL,
    published_at   timestamptz NOT NULL,
    -- The listing version this row was built from. Required: a projection row
    -- without one cannot be checked for staleness or rebuilt idempotently.
    source_version integer NOT NULL,
    -- When the index wrote this row. Bookkeeping, not a searchable fact; it is
    -- deliberately absent from the result view.
    indexed_at     timestamptz NOT NULL,

    CONSTRAINT title_is_present CHECK (length(btrim(title)) > 0),
    CONSTRAINT category_path_is_a_slug_path CHECK (
        category_path ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$'
    ),
    CONSTRAINT price_is_not_negative CHECK (price_cents >= 0),
    -- Exactly Condition in PHP and the contract's ConditionGrade.
    CONSTRAINT condition_is_known CHECK (condition IN ('mint', 'excellent', 'good', 'worn')),
    -- Exactly Identity's five granted tiers (005_identity.sql). Search stores
    -- the tier, never the account that holds it.
    CONSTRAINT seller_tier_is_known CHECK (seller_tier IN ('T1', 'T2', 'T3', 'T4', 'T5')),
    CONSTRAINT source_version_is_positive CHECK (source_version >= 1)
);

COMMENT ON TABLE search.documents IS
    'One row per listing: the searchable projection. Rebuildable from listing state; no outbound read of the source module is needed to serve a query.';

COMMENT ON COLUMN search.documents.source_version IS
    'Listing version at projection time. A row behind the source is stale; a write behind the row is refused by search_documents_source_version_monotonic.';

-- ==========================================================================
-- Query support
-- ==========================================================================
-- The pilot scans a small index, so these are ordinary B-tree indexes rather
-- than a full-text GIN. They mirror the filters the query model exposes:
-- category path, price (and therefore bucket edges), condition, recency, and the
-- has-3d facet.

CREATE INDEX search_documents_by_category_price
    ON search.documents (category_path, price_cents);

CREATE INDEX search_documents_by_price
    ON search.documents (price_cents);

CREATE INDEX search_documents_by_condition
    ON search.documents (condition);

CREATE INDEX search_documents_by_published
    ON search.documents (published_at DESC);

CREATE INDEX search_documents_with_3d
    ON search.documents (has_3d)
    WHERE has_3d AND active;

-- ==========================================================================
-- Version monotonicity
-- ==========================================================================
-- The PHP index refuses an older version before writing. The trigger is the
-- second line of defence: a rebuild script or a future adapter cannot skip the
-- check by using a plain SQL UPDATE. No variables are declared, so there is no
-- PL/pgSQL state to reassign.

CREATE FUNCTION search.refuse_source_version_regression() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.source_version < OLD.source_version THEN
        RAISE EXCEPTION 'search document % was rebuilt from source version %, older than the indexed version %',
            OLD.id, NEW.source_version, OLD.source_version
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

COMMENT ON FUNCTION search.refuse_source_version_regression() IS
    'Refuses a projection update whose source_version is older than the stored one. Same-version content equality is enforced in SearchDocument and InMemorySearchIndex.';

CREATE TRIGGER search_documents_source_version_monotonic
    BEFORE UPDATE ON search.documents
    FOR EACH ROW EXECUTE FUNCTION search.refuse_source_version_regression();

-- ==========================================================================
-- search.result_documents — the public projection
-- ==========================================================================
-- The view is the read path and the structural promise: it selects the closed,
-- non-personal column list and nothing else. A search result cannot expose a
-- field this view does not name.

CREATE VIEW search.result_documents AS
SELECT
    id,
    title,
    category_path,
    price_cents,
    condition,
    seller_tier,
    has_photo,
    has_3d,
    has_video,
    active,
    published_at,
    source_version
FROM search.documents;

COMMENT ON VIEW search.result_documents IS
    'Exactly the non-personal search projection. If a personal column is ever added to search.documents, the DDL parity test fails rather than the view silently widening.';

-- ==========================================================================
-- Grants (002's shape): the app rebuilds and reads, never deletes
-- ==========================================================================
-- documents is mutable because a newer source version replaces a row. There is
-- no DELETE: a row that disappears is a listing that cannot be shown to have
-- been indexed, and a rebuild is an overwrite, not a truncate.

GRANT USAGE ON SCHEMA search TO nastech_app, nastech_owner;

GRANT SELECT, INSERT, UPDATE ON search.documents TO nastech_app;

GRANT SELECT ON search.result_documents TO nastech_app;

GRANT SELECT ON ALL TABLES IN SCHEMA search TO nastech_owner;

ALTER DEFAULT PRIVILEGES IN SCHEMA search GRANT SELECT ON TABLES TO nastech_app;

COMMIT;
