-- NasTech Market — 003, the Media module (schema `media`)
--
-- STATE: written against src/Media/Schema.php and src/Media/MediaRecord.php.
-- NOT YET EXECUTED: this environment has no PostgreSQL and no PDO driver. The two
-- tests standing in for running it are tests/Media/MediaDdlTest.php (the DDL and the
-- model declare the same tables, columns, append-only triggers, unique indexes,
-- named row rules and vocabularies) and
-- tests/Media/MediaRowsSatisfyTheDdlChecksTest.php (every row the media path writes
-- is fed through every row CHECK on its table by tests/Support/DdlRowChecks.php).
--
-- Still unproven and needing `psql -v ON_ERROR_STOP=1` against a real cluster: that
-- this file parses; that the version trigger and the delete trigger bind; that the
-- grants bind as described; and that a real bucket adapter honours the same
-- put-is-immutable rule InMemoryObjectStore models.
--
-- ADR 0002 put media in PHP: an asset that cannot be counted cannot be reconciled
-- against the ≈R270 it cost to capture, and a listing's evidence set is part of a
-- money-bearing dispute. The module has no outbound edges. Every column that names
-- another module's object is deliberate and absent: there is no listing_id, no
-- order_id, no capture_job_id. Other modules name media ids; media names nothing.
--
-- Idempotence: none. Runs once, inside a transaction, like 001.

BEGIN;

-- ==========================================================================
-- Schema
-- ==========================================================================

CREATE SCHEMA media;

COMMENT ON SCHEMA media IS
    'Content-addressed media facts and their digest verifications. No outbound edges: Media names no listing, order, capture or account row.';

-- ==========================================================================
-- media.assets — the immutable fact set, plus the state that moves
-- ==========================================================================

CREATE TABLE media.assets (
    id                  text PRIMARY KEY,
    -- Opaque account reference. Deliberately not a foreign key to identity: media
    -- must remain readable when the account row is anonymised or gone, and an FK
    -- across schemas is how two modules become one. An erasure replaces this value
    -- with a keyed pseudonym (markErasureRequested), so the reference is never
    -- silently NULL.
    owner_account_id    text NOT NULL CHECK (length(btrim(owner_account_id)) > 0),
    purpose             text NOT NULL CHECK (purpose IN (
                            'photo', 'poster', 'turntable_frame', 'mesh', 'texture',
                            'rendition', 'evidence'
                        )),
    state               text NOT NULL CHECK (state IN (
                            'STAGED', 'VERIFIED', 'PUBLISHED', 'RETIRED', 'REJECTED'
                        )),
    -- The digest is the identity of the bytes. Lowercase hex only: an uppercase
    -- spelling would produce a second bucket key for the same content and the
    -- reconciliation ADR 0002 asks for would stop closing.
    sha256              text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    -- Derived, never supplied. assets_key_follows_digest refuses any row whose key
    -- is not the content address of its sha256, so a row cannot point at content
    -- somebody else put at a trusted address.
    storage_key         text NOT NULL CHECK (storage_key ~ '^private/cas/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{64}$'),
    size_bytes          bigint NOT NULL CHECK (size_bytes > 0),
    mime                text NOT NULL CHECK (mime ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'),
    -- Nullable by decision: a mesh has no pixel dimensions. Both are set or neither
    -- is; a half-pair is a record whose viewer has no aspect ratio (see
    -- dimensions_come_in_pairs).
    width_px            integer CHECK (width_px IS NULL OR width_px > 0),
    height_px           integer CHECK (height_px IS NULL OR height_px > 0),
    -- Nullable: not every camera or exporter declares a profile. NULL means
    -- "not recorded", never "sRGB assumed".
    colour_profile      text,
    source_device       text,
    -- Nullable for everything except evidence. evidence_says_where_it_was_shot
    -- makes it mandatory there: a chain of custody with no station is not custody.
    capture_station     text,
    retention_class     text NOT NULL CHECK (retention_class IN (
                            'TRANSIENT', 'LISTING', 'EVIDENCE', 'LEGAL_HOLD'
                        )),
    -- Never empty. The reason is the sentence a dispute or a regulator reads a year
    -- later; `retention_reason_is_mandatory` is the same rule in the model.
    retention_reason    text NOT NULL CHECK (length(btrim(retention_reason)) > 0),
    -- NULL for a source record, not a 'NONE' sentinel. The partial unique index
    -- below relies on that decision: a sentinel would be a value no frontend knows.
    rendition_kind      text CHECK (rendition_kind IS NULL OR rendition_kind IN (
                            'MODEL', 'SPRITE', 'POSTER', 'MACRO', 'THUMBNAIL'
                        )),
    lod_tier            text CHECK (lod_tier IS NULL OR lod_tier IN (
                            'lod0', 'lod1', 'lod2', 'poster'
                        )),
    -- Nullable exactly when this record is a source. A rendition that names no
    -- source is a derived artefact whose provenance nobody can produce.
    source_asset_id     text REFERENCES media.assets (id) ON DELETE RESTRICT,
    -- The proof that the bytes were read back and hashed. A record may be STAGED
    -- with false; nothing past STAGED may.
    digest_verified     boolean NOT NULL,
    version             integer NOT NULL CHECK (version >= 1),
    created_at          timestamptz NOT NULL,
    verified_at         timestamptz,
    published_at        timestamptz,
    retired_at          timestamptz,
    reject_reason       text,
    retirement_reason   text,
    -- Set by an erasure request. It marks, it does not delete: evidence and legal
    -- holds have to outlive the account that filed them (POPIA s.14).
    erasure_requested_at timestamptz,
    -- The only date a sweep may act on. Nullable, and NULL means "nothing scheduled
    -- this", which is a refusal in PurgeExpiredMedia rather than an invitation.
    purge_after_at      timestamptz,

    -- The brief's headline rules, each named because a constraint name is the only
    -- thing that survives a stack trace.

    -- A record whose digest has not been proven cannot leave STAGED, so there is no
    -- path from an unverified upload to a buyer's screen at any version of the code.
    CONSTRAINT only_a_verified_digest_leaves_staged CHECK (
        state = 'STAGED' OR digest_verified = true
    ),

    -- Evidence never renders in a gallery, in storage as well as in the domain.
    CONSTRAINT evidence_is_never_published CHECK (
        purpose <> 'evidence' OR state <> 'PUBLISHED'
    ),

    -- Evidence is not a transient upload: it is kept as long as a dispute can be
    -- reopened, which is longer than the account and longer than the listing.
    CONSTRAINT evidence_is_never_transient CHECK (
        purpose <> 'evidence' OR retention_class IN ('EVIDENCE', 'LEGAL_HOLD')
    ),

    CONSTRAINT evidence_says_where_it_was_shot CHECK (
        purpose <> 'evidence'
        OR (capture_station IS NOT NULL AND length(btrim(capture_station)) > 0)
    ),

    -- A purge date on evidence is the shape of a bug in which a timer deletes a
    -- dispute record. The sweep also refuses it in PHP; this refuses the row.
    CONSTRAINT purge_never_scheduled_on_evidence CHECK (
        retention_class NOT IN ('EVIDENCE', 'LEGAL_HOLD') OR purge_after_at IS NULL
    ),

    CONSTRAINT rendition_has_both_halves CHECK (
        (rendition_kind IS NULL AND lod_tier IS NULL)
        OR (rendition_kind IS NOT NULL AND lod_tier IS NOT NULL)
    ),

    CONSTRAINT rendition_hangs_off_a_source CHECK (
        rendition_kind IS NULL OR source_asset_id IS NOT NULL
    ),

    CONSTRAINT a_source_hangs_off_nothing CHECK (
        rendition_kind IS NOT NULL OR source_asset_id IS NULL
    ),

    CONSTRAINT a_record_is_not_its_own_source CHECK (
        source_asset_id IS NULL OR source_asset_id <> id
    ),

    CONSTRAINT retention_reason_is_mandatory CHECK (
        length(btrim(retention_reason)) > 0
    ),

    CONSTRAINT a_rejection_says_why CHECK (
        state <> 'REJECTED'
        OR (reject_reason IS NOT NULL AND length(btrim(reject_reason)) > 0)
    ),

    CONSTRAINT a_retirement_says_why CHECK (
        state <> 'RETIRED'
        OR (retirement_reason IS NOT NULL AND length(btrim(retirement_reason)) > 0)
    ),

    CONSTRAINT dimensions_come_in_pairs CHECK (
        (width_px IS NULL AND height_px IS NULL)
        OR (width_px IS NOT NULL AND height_px IS NOT NULL)
    )
);

COMMENT ON COLUMN media.assets.storage_key IS
    'private/cas/<sha[0:2]>/<sha[2:4]>/<sha256>. Derived, never supplied; the trigger assets_key_follows_digest re-derives it inside the database.';
COMMENT ON COLUMN media.assets.source_asset_id IS
    'The source record a rendition was derived from. NULL exactly when rendition_kind is NULL; a rendition with no source has no provenance.';
COMMENT ON COLUMN media.assets.version IS
    'Optimistic compare-and-swap. assets_version_monotonic refuses any UPDATE that does not advance it, so a stale aggregate cannot roll a record backwards.';

-- The content-addressed uniqueness the brief asks for, exactly: two renditions of
-- the same bytes at the same kind and tier cannot exist. It is a partial index
-- because a source record has NULL kind and tier, and PostgreSQL treats NULLs as
-- distinct — which is the behaviour we want: source uploads are deduplicated by
-- their derived primary key (owner, digest), not by this triple.
CREATE UNIQUE INDEX media_rendition_content_is_unique
    ON media.assets (sha256, rendition_kind, lod_tier)
    WHERE rendition_kind IS NOT NULL AND lod_tier IS NOT NULL;

CREATE INDEX media_assets_by_owner ON media.assets (owner_account_id, created_at DESC);
CREATE INDEX media_assets_by_source ON media.assets (source_asset_id)
    WHERE source_asset_id IS NOT NULL;
CREATE INDEX media_assets_due_for_purge ON media.assets (purge_after_at)
    WHERE purge_after_at IS NOT NULL;

CREATE FUNCTION media.assert_asset_version_monotonic() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.version <= OLD.version THEN
        RAISE EXCEPTION 'media asset % saved at version %, which does not advance the stored version %',
            OLD.id, NEW.version, OLD.version
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER assets_version_monotonic
    BEFORE UPDATE ON media.assets
    FOR EACH ROW EXECUTE FUNCTION media.assert_asset_version_monotonic();

-- The key is a pure function of the digest. Re-deriving it in the database means a
-- psql session, a migration, or a support script cannot repoint a trusted address
-- at other content while the PHP model is not looking.
CREATE FUNCTION media.assert_asset_key_follows_digest() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.storage_key <> 'private/cas/' || substr(NEW.sha256, 1, 2) || '/'
        || substr(NEW.sha256, 3, 2) || '/' || NEW.sha256 THEN
        RAISE EXCEPTION 'media asset % declares key %, which is not the content address of sha256 %',
            NEW.id, NEW.storage_key, NEW.sha256
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER assets_key_follows_digest
    BEFORE INSERT OR UPDATE OF sha256, storage_key ON media.assets
    FOR EACH ROW EXECUTE FUNCTION media.assert_asset_key_follows_digest();

-- A record that is evidence, or held under an evidence/legal-hold class, cannot be
-- deleted at all. Ordinary listing media may be deleted only once its purge date
-- has arrived: an early DELETE is the shape of a sweep that ignored retention.
CREATE FUNCTION media.assert_asset_may_be_deleted() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.purpose = 'evidence' OR OLD.retention_class IN ('EVIDENCE', 'LEGAL_HOLD') THEN
        RAISE EXCEPTION 'media asset % is evidence and is never deleted; the erasure request marks it',
            OLD.id USING ERRCODE = 'check_violation',
                  HINT = 'POPIA s.14 keeps a record a law or a dispute needs.';
    END IF;
    IF OLD.purge_after_at IS NULL OR OLD.purge_after_at > now() THEN
        RAISE EXCEPTION 'media asset % has no due purge date; nothing scheduled it for deletion',
            OLD.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
END $$;

CREATE TRIGGER assets_evidence_row_cannot_be_deleted
    BEFORE DELETE ON media.assets
    FOR EACH ROW EXECUTE FUNCTION media.assert_asset_may_be_deleted();

-- ==========================================================================
-- media.digest_verifications — append-only evidence of the check
-- ==========================================================================
-- The record says what the bytes hashed to and who looked. It is the answer to
-- "prove this asset was verified", and it survives the asset row so a deleted
-- transient upload still leaves the fact that it was checked and rejected.

CREATE TABLE media.digest_verifications (
    id                text PRIMARY KEY,
    asset_id          text NOT NULL,
    declared_sha256   text NOT NULL CHECK (declared_sha256 ~ '^[0-9a-f]{64}$'),
    observed_sha256   text NOT NULL CHECK (observed_sha256 ~ '^[0-9a-f]{64}$'),
    result            text NOT NULL CHECK (result IN ('MATCH', 'MISMATCH')),
    observed_at       timestamptz NOT NULL,
    observed_by       text NOT NULL CHECK (length(btrim(observed_by)) > 0),

    -- A MISMATCH that names one digest twice is self-contradictory: it claims two
    -- different byte strings hashed to the same value.
    CONSTRAINT a_mismatch_names_different_bytes CHECK (
        result <> 'MISMATCH' OR declared_sha256 <> observed_sha256
    ),

    -- Verification is a fact about an observer, not an anonymous system event.
    CONSTRAINT a_verification_names_its_observer CHECK (
        length(btrim(observed_by)) > 0
    )
);

COMMENT ON TABLE media.digest_verifications IS
    'Append-only. One row per (asset, outcome); a retry after a timeout collides on the unique index and resolves to the row that exists.';

CREATE UNIQUE INDEX digest_verification_recorded_once_per_outcome
    ON media.digest_verifications (asset_id, result);

CREATE INDEX digest_verifications_by_asset
    ON media.digest_verifications (asset_id, observed_at DESC);

CREATE TRIGGER digest_verifications_append_only
    BEFORE UPDATE OR DELETE ON media.digest_verifications
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

COMMIT;

-- ==========================================================================
-- Grants: least privilege for media
-- ==========================================================================
-- Shape follows 002. The application may insert and update assets (state moves) and
-- append verifications, but it may not delete an asset at all. Deletion is the purge
-- sweep's job and runs as nastech_owner, after the retention rules and the delete
-- trigger have both agreed. A role that can DELETE media.assets is a role that can
-- erase the asset a dispute is about, whatever the domain says.

GRANT USAGE ON SCHEMA media TO nastech_app;
GRANT USAGE ON SCHEMA media TO nastech_owner;

GRANT SELECT, INSERT, UPDATE ON media.assets TO nastech_app;
GRANT SELECT, INSERT ON media.digest_verifications TO nastech_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON media.assets TO nastech_owner;
GRANT SELECT, INSERT ON media.digest_verifications TO nastech_owner;

GRANT SELECT ON ALL TABLES IN SCHEMA media TO nastech_app;

ALTER FUNCTION media.assert_asset_version_monotonic() OWNER TO nastech_owner;
ALTER FUNCTION media.assert_asset_key_follows_digest() OWNER TO nastech_owner;
ALTER FUNCTION media.assert_asset_may_be_deleted() OWNER TO nastech_owner;
ALTER TRIGGER assets_version_monotonic ON media.assets OWNER TO nastech_owner;
ALTER TRIGGER assets_key_follows_digest ON media.assets OWNER TO nastech_owner;
ALTER TRIGGER assets_evidence_row_cannot_be_deleted ON media.assets OWNER TO nastech_owner;
ALTER TRIGGER digest_verifications_append_only ON media.digest_verifications OWNER TO nastech_owner;

ALTER DEFAULT PRIVILEGES IN SCHEMA media GRANT SELECT ON TABLES TO nastech_app;

-- ==========================================================================
-- Deliberately NOT in this file
-- ==========================================================================
-- * Any reference to a listing, an order, a capture job or an account row. Media
--   has no outbound edges; a foreign key here would make the module unshardable
--   and would let a listing deletion decide what evidence survives. Other modules
--   name media ids; this schema names none of theirs.
-- * A signed URL, a bucket credential or a TTL. Those are runtime decisions over
--   these rows, never columns: a URL written down is a credential in a backup.
-- * A state-machine transition table. The ladder is owned by
--   MediaTransitions::TABLE, deny-by-default, and the DDL constrains the
--   vocabulary plus the two states that must never be reachable from an
--   unverified or evidence row. A second copy of the machine would drift.
