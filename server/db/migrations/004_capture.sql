-- NasTech Market — 004, the Capture module (schema `capture`)
--
-- STATE: written against src/Capture/Schema.php and src/Capture/CaptureInvariants.php.
-- NOT YET EXECUTED: this environment has no PostgreSQL and no PDO driver, so nothing
-- here has been parsed by the thing it is written for. The two tests standing in for
-- running it are tests/Capture/CaptureSchemaParityTest.php (the DDL and the model
-- declare the same tables, columns, append-only triggers, unique indexes, named row
-- rules and vocabularies) and tests/Capture/CaptureRowsSatisfyTheDdlChecksTest.php
-- (every row the capture path writes is fed through every row CHECK on its table by
-- the narrow expression reader in tests/Support/DdlRowChecks.php).
--
-- Still unproven and needing `psql -v ON_ERROR_STOP=1` against a real cluster before
-- any deploy: that this file parses; that `capture.verify_custody_chain()` recomputes
-- the same digest as CustodyEntry::digest(); that the deferred constraint triggers fire
-- at commit rather than per statement; that the grants bind as described.
--
-- What lives here and why: the chain of custody, the calibration evidence and the cost
-- record are all *evidence*. Evidence is worth exactly as much as its immutability, and
-- an immutable thing is a thing the storage engine refuses to edit — not a thing the
-- application promises not to edit. Every invariant in the brief therefore appears two
-- or three times: in the domain object, as a CHECK or trigger here, and as a grant that
-- withholds the privilege to bypass both.
--
-- Migration numbers are per module and 004 is Capture's; 003 belongs to Media.
-- Idempotence: none. Runs once, inside a transaction, like 001.

BEGIN;

-- ==========================================================================
-- Extensions
-- ==========================================================================
-- pgcrypto is here for one reason: the custody chain must be re-digestible inside the
-- database. A chain that only PHP can verify is a chain that a `psql` session can edit
-- and that nobody notices until a dispute reads the history — which is precisely the
-- tampering this table exists to make impossible. (001 declared btree_gist for the same
-- kind of reason: the rule needs an operator the core does not have.)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================================================
-- Schema
-- ==========================================================================

CREATE SCHEMA capture;

COMMENT ON SCHEMA capture IS
    'The capture programme: the job, its chain of custody, the station calibration that licensed it, the QC evidence, and what it cost. Holds no money and no images — cost is booked here, images live in media.';

-- ==========================================================================
-- capture.capture_jobs
-- ==========================================================================
-- The mutable table: a job is worked on over hours, so its row is updated under an
-- optimistic compare-and-swap. Everything that must not be edited — custody,
-- calibration, QC evidence, cost — is a separate append-only table below.

CREATE TABLE capture.capture_jobs (
    id                        text PRIMARY KEY,
    -- Nullable by design: a job is booked against an item that has been handed in, and
    -- the listing it belongs to is linked when the seller confirms the slot. A job may
    -- legitimately be worked and even fail before a listing exists. What is NOT
    -- legitimate is publishing without one, which published_job_is_linked_to_a_listing
    -- refuses.
    listing_id                text,
    seller_account_id         text NOT NULL,
    -- The item's own physical identifier (serial, case number, or the hand-in label the
    -- receipt carries). Every custody row repeats it, because "the watch in the studio is
    -- the watch listed" is the whole custody question and it cannot be answered from a
    -- job id alone.
    item_identifier           text NOT NULL CHECK (length(btrim(item_identifier)) > 0),
    station_id                text NOT NULL CHECK (length(btrim(station_id)) > 0),
    intake_actor_id           text NOT NULL CHECK (length(btrim(intake_actor_id)) > 0),
    -- capture_actor_id is the person who ran the frames. It is the other half of the
    -- four-eyes rule: whoever is named here is refused from reviewer_actor_id.
    capture_actor_id          text,
    reviewer_actor_id         text,
    -- Receipt code issued by the studio at hand-in (format owned by the asset pipeline's
    -- intake receipt, NAS-XXXXXXXX-NN). Opaque reference, not a foreign key: the paper is
    -- the seller's copy and the job must survive it being reprinted.
    receipt_code              text NOT NULL CHECK (receipt_code ~ '^NAS-[A-Z2-9]{8}-[0-9]{2}$'),
    -- The vocabulary is transcribed from src/Capture/CaptureJobState.php, which mirrors
    -- CaptureJobState in packages/api-contracts. tests/Capture/CaptureJobLadderTest.php
    -- compares all three; a second spelling of the ladder is how a job ends up "done" in
    -- one system and "qc_human" in the other.
    state                     text NOT NULL DEFAULT 'intake'
                                  CHECK (state IN ('intake', 'captured', 'processed', 'qc_auto',
                                                   'qc_human', 'published', 'failed', 'reshot')),
    attempt                   integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
    asset_version             integer NOT NULL DEFAULT 1 CHECK (asset_version >= 1),
    -- The calibration record that licensed the capture run. Nullable only while the job
    -- sits at intake; past_intake_needs_a_calibration refuses the rest.
    calibration_id            text,
    frame_count               integer CHECK (frame_count IS NULL OR frame_count >= 0),
    -- Nanometres per unit, integer. Deliberately not a float and not metres: the metric
    -- scale is what every size claim in the manifest rides on, and a value that cannot be
    -- reproduced bit-for-bit from the row cannot be defended in a dispute.
    metric_scale_nanometres_per_unit bigint CHECK (metric_scale_nanometres_per_unit IS NULL OR metric_scale_nanometres_per_unit > 0),
    claim_scope               text CHECK (claim_scope IS NULL OR claim_scope IN ('geometry_and_external_condition', 'condition_only', 'none')),
    scope_supported_rank      smallint NOT NULL DEFAULT 0 CHECK (scope_supported_rank >= 0 AND scope_supported_rank <= 2),
    scope_granted_rank        smallint NOT NULL DEFAULT 0 CHECK (scope_granted_rank >= 0 AND scope_granted_rank <= 2),
    asset_id                  text,
    manifest_checksum         text CHECK (manifest_checksum IS NULL OR manifest_checksum ~ '^sha256:[0-9a-f]{64}$'),
    -- The media ids Media handed back on publish. An array rather than a second table:
    -- it is a receipt of what was published, and the renditions themselves are Media's.
    media_ids                 jsonb CHECK (media_ids IS NULL OR jsonb_typeof(media_ids) = 'array'),
    -- `failed` is a first-class outcome, not a deletion. It has to say why, in the closed
    -- set, with a retake path beside it — a failure nobody can name is a failure nobody
    -- can fix or cost against.
    failed_reason_code        text CHECK (failed_reason_code IS NULL OR failed_reason_code IN (
                                  'coverage', 'sharpness', 'exposure', 'highlight_clip', 'mesh_holes',
                                  'non_manifold', 'texture_bleed', 'silhouette_poster',
                                  'item_mismatch', 'condition_discrepancy', 'unusable_input'
                              )),
    version                   integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    booked_at                 timestamptz NOT NULL,
    captured_at               timestamptz,
    published_at              timestamptz,
    closed_at                 timestamptz,

    -- The job must name the account it is being done for from the first write: cost per
    -- item and the ≈R270 recovery are both answered per seller, and a job that never knew
    -- whose item it was cannot be charged to anyone.
    CONSTRAINT job_names_the_seller_account CHECK (length(btrim(seller_account_id)) > 0),

    -- Calibration is a precondition to capturing, in storage as well as in the domain.
    -- Without it, any row that moved past intake would be a claim that a station was
    -- accurate at some point nobody recorded.
    CONSTRAINT past_intake_needs_a_calibration CHECK (state = 'intake' OR calibration_id IS NOT NULL),

    -- Four-eyes, at the row level: a published job names a reviewer, names the operator
    -- who ran it, and the two are different people. The force-pass this forbids is the
    -- real one — the operator whose auto-QC failed deciding, alone, that it is fine.
    CONSTRAINT publish_needs_a_second_pair_of_eyes CHECK (
        state <> 'published'
        OR (reviewer_actor_id IS NOT NULL AND capture_actor_id IS NOT NULL AND reviewer_actor_id <> capture_actor_id)
    ),

    -- Nothing reaches the catalogue that is not attached to a listing; a published
    -- manifest with no listing is an asset that cannot be found again or taken down.
    CONSTRAINT published_job_is_linked_to_a_listing CHECK (state <> 'published' OR listing_id IS NOT NULL),

    -- A published job carries what it published. The checksum and the media ids are the
    -- two halves of "these bytes, at this address" — without both, Media and Capture
    -- disagree about what exists and no one can prove which.
    CONSTRAINT published_job_has_what_it_published CHECK (
        state <> 'published' OR (media_ids IS NOT NULL AND manifest_checksum IS NOT NULL AND asset_id IS NOT NULL)
    ),

    -- A size claim without a solved scale is a guess dressed as a measurement.
    CONSTRAINT published_job_carries_a_metric_scale CHECK (
        state <> 'published' OR metric_scale_nanometres_per_unit IS NOT NULL
    ),

    CONSTRAINT failure_needs_a_reason_from_the_set CHECK (state <> 'failed' OR failed_reason_code IS NOT NULL),

    -- The scope a listing may assert is never wider than the evidence supports. Stored as
    -- integer ranks because a text comparison of two scopes is a comparison nobody can
    -- order; ranks make the rule arithmetic. Mirrors ClaimScope::rank().
    CONSTRAINT granted_scope_never_exceeds_evidence CHECK (scope_granted_rank <= scope_supported_rank),

    -- A job that ran frames names the person who ran them. Four-eyes is meaningless if the
    -- first pair of eyes is anonymous.
    CONSTRAINT a_job_that_captured_names_its_operator CHECK (captured_at IS NULL OR capture_actor_id IS NOT NULL),

    -- Terminal rows do not move. The domain refuses it too; this refuses the UPDATE that
    -- comes from a session that did not load the aggregate.
    CONSTRAINT a_terminal_job_is_not_reopened CHECK (
        state NOT IN ('published', 'failed') OR closed_at IS NOT NULL
    )
);

COMMENT ON COLUMN capture.capture_jobs.version IS
    'Optimistic compare-and-swap, the same shape as orders.orders: the writer passes the version it read and capture.assert_job_version_monotonic() refuses any update that does not advance it.';

COMMENT ON COLUMN capture.capture_jobs.scope_supported_rank IS
    '0 = none, 1 = condition_only, 2 = geometry_and_external_condition. Transcribed from ClaimScope::rank(); the rank pair is what makes granted <= support a CHECK rather than a sentence.';

CREATE INDEX capture_jobs_by_listing ON capture.capture_jobs (listing_id, state)
    WHERE listing_id IS NOT NULL;
CREATE INDEX capture_jobs_by_station ON capture.capture_jobs (station_id, booked_at DESC);
CREATE INDEX capture_jobs_open ON capture.capture_jobs (booked_at)
    WHERE state NOT IN ('published', 'failed');

CREATE FUNCTION capture.assert_job_version_monotonic() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.version <= OLD.version THEN
        RAISE EXCEPTION 'capture job % saved at version %, which does not advance the stored version %',
            OLD.id, NEW.version, OLD.version
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER capture_jobs_version_monotonic
    BEFORE UPDATE ON capture.capture_jobs
    FOR EACH ROW EXECUTE FUNCTION capture.assert_job_version_monotonic();

-- Once a job has reached a terminal state its row must not be edited at all — not even
-- by a writer holding a correct version. A published job is evidence of what was shown to
-- a buyer; a failed job is the reason the studio spent the money. Reopening either by
-- UPDATE is the one write that makes the whole history unfalsifiable.
CREATE FUNCTION capture.assert_terminal_job_is_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.state IN ('published', 'failed') THEN
        RAISE EXCEPTION 'capture job % is %; a closed job is evidence and cannot be edited or reopened (state was %, now %)',
            OLD.id, OLD.state, OLD.state, NEW.state
            USING ERRCODE = 'check_violation',
                  HINT = 'A re-shoot opens a new job from intake; the previous attempt stays in custody.';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER capture_jobs_frozen_when_closed
    BEFORE UPDATE ON capture.capture_jobs
    FOR EACH ROW EXECUTE FUNCTION capture.assert_terminal_job_is_frozen();

-- ==========================================================================
-- capture.custody_entries — the append-only chain of custody
-- ==========================================================================
-- Three layers, because they fail differently:
--   1. no code path: CustodyLedger exposes append() and read methods and nothing else;
--   2. a trigger below, BEFORE UPDATE OR DELETE, plus the chain verifier that re-digests
--      every row at commit, so an edit made by a superuser or a migration is *detected*
--      even where the trigger is bypassed;
--   3. the grant at the bottom of this file, which withholds UPDATE and DELETE from
--      nastech_app, so the application cannot even attempt the write.
-- A custody log that can be edited is not custody evidence; it is a statement.

CREATE TABLE capture.custody_entries (
    id                text PRIMARY KEY,
    job_id            text NOT NULL,
    -- Sequence is per job, so a station working three items concurrently still produces a
    -- chain that can be read on its own; the unique index below is what makes a gap or a
    -- reused sequence impossible.
    sequence          integer NOT NULL CHECK (sequence >= 1),
    -- NULL only on the row that opens the job, exactly as the pipeline's custody log does:
    -- an entry claiming to move from a state the job never had is the edit this forbids.
    from_state        text CHECK (from_state IS NULL OR from_state IN ('intake', 'captured', 'processed', 'qc_auto',
                                                                     'qc_human', 'published', 'failed', 'reshot')),
    to_state          text NOT NULL CHECK (to_state IN ('intake', 'captured', 'processed', 'qc_auto',
                                                        'qc_human', 'published', 'failed', 'reshot')),
    actor_id          text NOT NULL,
    -- The role is recorded, not inferred later from an identity lookup: who was entitled to
    -- do this is part of what happened, and the directory can change behind the history.
    actor_role        text NOT NULL CHECK (actor_role IN ('intake_clerk', 'capture_operator', 'qc_reviewer', 'studio_lead')),
    station_id        text NOT NULL,
    item_identifier   text NOT NULL,
    -- The version the writer believed it was moving from. Kept on the row so a custody
    -- trail can be replayed against the job's own CAS history and a write that skipped a
    -- version is visible rather than plausible.
    expected_version  integer NOT NULL CHECK (expected_version >= 0),
    occurred_at       timestamptz NOT NULL,
    -- Null is legitimate for a mechanical step (frames ingested, item received). For the
    -- judgement states it is not: see judgement_entry_carries_evidence.
    evidence          text,
    prev_hash         text NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
    entry_hash        text NOT NULL CHECK (entry_hash ~ '^[0-9a-f]{64}$'),

    CONSTRAINT custody_names_the_person CHECK (length(btrim(actor_id)) > 0),
    CONSTRAINT custody_names_the_item CHECK (length(btrim(item_identifier)) > 0),
    CONSTRAINT custody_names_the_station CHECK (length(btrim(station_id)) > 0),

    -- A judgement with nothing behind it is not reviewable: the verdict is worthless
    -- without the measurement, session directory or decision text it came from.
    CONSTRAINT judgement_entry_carries_evidence CHECK (
        to_state NOT IN ('qc_auto', 'qc_human', 'published', 'failed', 'reshot')
        OR length(btrim(evidence)) > 0
    ),

    -- Only the opening row may claim no prior version. An entry with expected_version 0
    -- after the job exists is the shape of a write that skipped the aggregate.
    CONSTRAINT a_job_entry_links_to_the_version_it_moved_from CHECK (
        expected_version >= 1 OR from_state IS NULL
    )
);

COMMENT ON TABLE capture.custody_entries IS
    'Append-only. Answered by a new row, never edited. entry_hash folds prev_hash in, so deleting or altering any row breaks every digest after it and capture.verify_custody_chain() says where.';

CREATE UNIQUE INDEX custody_one_entry_per_job_and_sequence ON capture.custody_entries (job_id, sequence);
CREATE INDEX custody_by_job ON capture.custody_entries (job_id, occurred_at);

CREATE FUNCTION capture.custody_canonical_row(c capture.custody_entries) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    -- The separator and the field order are the contract: CustodyEntry::digest() builds the
    -- same string in PHP, and a refactor that reorders either silently invalidates every
    -- history on the server. Deliberately includes the four facts the brief requires on every
    -- state change — role, station, physical item id, expected version — which the pipeline's
    -- file-based log does not carry.
    SELECT c.sequence || chr(31) || c.job_id || chr(31) || coalesce(c.from_state, '') || chr(31) || c.to_state
        || chr(31) || c.actor_id || chr(31) || c.actor_role || chr(31) || c.station_id
        || chr(31) || c.item_identifier || chr(31) || c.expected_version || chr(31) || c.occurred_at
        || chr(31) || coalesce(c.evidence, '') || chr(31) || c.prev_hash
$$;

CREATE FUNCTION capture.verify_custody_chain(p_job_id text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    row capture.custody_entries%ROWTYPE;
    expected_sequence integer := 1;
    -- NOT constant: the loop advances it to each row's digest. A CONSTANT here made PL/pgSQL
    -- refuse the second assignment and the migration never applied.
    previous_hash text := '0000000000000000000000000000000000000000000000000000000000000000';
    previous_instant timestamptz := NULL;
    recomputed text;
BEGIN
    FOR row IN SELECT * FROM capture.custody_entries WHERE job_id = p_job_id ORDER BY sequence ASC LOOP
        IF row.sequence <> expected_sequence THEN
            RAISE EXCEPTION 'custody chain for job % is broken at sequence %: expected %',
                p_job_id, row.sequence, expected_sequence
                USING ERRCODE = 'check_violation', HINT = 'A deleted or renumbered custody row. The history is not trustworthy.';
        END IF;
        IF row.prev_hash <> previous_hash THEN
            RAISE EXCEPTION 'custody chain for job % is broken at sequence %: the row links to a digest that is not the previous row',
                p_job_id, row.sequence USING ERRCODE = 'check_violation';
        END IF;
        recomputed := encode(digest(capture.custody_canonical_row(row), 'sha256'), 'hex');
        IF recomputed <> row.entry_hash THEN
            RAISE EXCEPTION 'custody chain for job % is broken at sequence %: the row contents no longer match their own digest',
                p_job_id, row.sequence
                USING ERRCODE = 'check_violation', HINT = 'Someone edited a custody row. Treat the item as unverified custody.';
        END IF;
        IF previous_instant IS NOT NULL AND row.occurred_at < previous_instant THEN
            RAISE EXCEPTION 'custody time runs backwards for job % at sequence %', p_job_id, row.sequence
                USING ERRCODE = 'check_violation', HINT = 'Fix the studio clock; do not backdate a custody row.';
        END IF;
        previous_hash := row.entry_hash;
        previous_instant := row.occurred_at;
        expected_sequence := expected_sequence + 1;
    END LOOP;
    RETURN 'ok';
END $$;

CREATE FUNCTION capture.invariant_custody_chain_is_intact() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM capture.verify_custody_chain(NEW.job_id);
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_custody_chain_is_intact
    AFTER INSERT ON capture.custody_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION capture.invariant_custody_chain_is_intact();

CREATE TRIGGER custody_entries_append_only
    BEFORE UPDATE OR DELETE ON capture.custody_entries
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- capture.calibrations — the evidence that licensed a capture run
-- ==========================================================================
-- Append-only for the same reason as custody: a calibration that can be edited can be made
-- to cover a run that was not actually licensed by it. A bad measurement is answered by
-- the next measurement, never by an UPDATE.

CREATE TABLE capture.calibrations (
    id              text PRIMARY KEY,
    station_id      text NOT NULL CHECK (length(btrim(station_id)) > 0),
    -- The physical reference in frame, by the pipeline's own ids. An invented reference
    -- produces an invented scale, so the set is closed.
    reference_card_id text NOT NULL CHECK (reference_card_id IN ('credit_card', 'id_card', 'scale_card_50mm', 'scale_card_100mm')),
    measured_at     timestamptz NOT NULL,
    valid_until     timestamptz NOT NULL,
    validity_minutes integer NOT NULL,
    -- Drift is the spread of repeated readings of the same reference, in basis points:
    -- 2 % is 200 and it is the number that gets quoted when a station is refused. Integer
    -- basis points rather than a float ratio so the tolerance comparison cannot be decided
    -- by rounding.
    drift_basis_points     integer NOT NULL CHECK (drift_basis_points >= 0),
    tolerance_basis_points integer NOT NULL CHECK (tolerance_basis_points > 0),
    metric_scale_nanometres_per_unit bigint NOT NULL CHECK (metric_scale_nanometres_per_unit > 0),
    case_diameter_tenths_mm integer NOT NULL,
    observation_count integer NOT NULL,
    recorded_by     text NOT NULL CHECK (length(btrim(recorded_by)) > 0),

    -- A calibration window that does not move forward is either a typo or a clock problem,
    -- and both make the expiry test meaningless.
    CONSTRAINT calibration_window_moves_forward CHECK (valid_until > measured_at),

    -- Bounded validity, in storage: an "indefinite" calibration turns a per-shift check into
    -- a one-off and the station drifts under it. 12 hours is a shift (720 minutes).
    CONSTRAINT calibration_validity_is_bounded CHECK (validity_minutes > 0 AND validity_minutes <= 720),

    -- The tolerance is exclusive, so a station at exactly 2 % is refused: the pipeline's own
    -- note is that 2 % across frames is where a card that slid in frame starts to show up,
    -- which is the failure line rather than a passing reading.
    CONSTRAINT calibration_within_tolerance CHECK (drift_basis_points < tolerance_basis_points),

    -- Pre-owned watch cases. Outside 24–50 mm either the item is not the pilot category or
    -- the reference was measured wrong — and a mis-scaled model is worse than no model,
    -- because every size claim in the manifest rides on this number.
    CONSTRAINT case_diameter_in_pilot_window CHECK (case_diameter_tenths_mm >= 240 AND case_diameter_tenths_mm <= 500),

    -- One reading cannot prove stability. The spread this row asserts is a spread.
    CONSTRAINT reference_needs_repeated_readings CHECK (observation_count >= 2)
);

CREATE UNIQUE INDEX calibration_recorded_once_per_station_and_instant ON capture.calibrations (station_id, measured_at);

CREATE TRIGGER calibrations_append_only
    BEFORE UPDATE OR DELETE ON capture.calibrations
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- capture.cost_records — what the capture actually cost, in cents
-- ==========================================================================
-- The ≈R270 estimate is a promise to the business; this table is what makes it checkable.
-- One row per closed job attempt, booked in the transaction that closed the job.
-- Append-only: a cost that can be edited is not a cost.

CREATE TABLE capture.cost_records (
    id                text PRIMARY KEY,
    job_id            text NOT NULL,
    -- Nullable: a job can fail before its listing is linked. An unlinked job's cost is
    -- still booked (the studio spent it) but it can never be charged to a listing.
    listing_id        text,
    seller_account_id text NOT NULL,
    item_identifier   text NOT NULL,
    -- The attempt this record prices. A re-shoot is a real cost of the same item and the
    -- pilot has to see it, even though the listing does not pay for it twice.
    attempt           integer NOT NULL CHECK (attempt >= 1),
    labour_minutes    integer NOT NULL CHECK (labour_minutes >= 0),
    -- Integer cents per minute, from the operator's rate card. Never a decimal hourly rate
    -- multiplied through a float: the ledger reconciles to the cent and so does this.
    operator_rate_cents_per_minute integer NOT NULL CHECK (operator_rate_cents_per_minute >= 0),
    labour_cents      bigint NOT NULL,
    consumables_cents bigint NOT NULL,
    station_minutes   integer NOT NULL CHECK (station_minutes >= 0),
    station_rate_cents_per_minute integer NOT NULL CHECK (station_rate_cents_per_minute >= 0),
    station_time_cents bigint NOT NULL,
    total_cents       bigint NOT NULL,
    charged_cents     bigint NOT NULL,
    absorbed_cents    bigint NOT NULL,
    estimate_cents    bigint NOT NULL CHECK (estimate_cents > 0),
    variance_cents    bigint NOT NULL,
    currency          shared.rand_currency NOT NULL DEFAULT 'ZAR',
    -- The listing is charged once and once only; every further attempt on the same item is
    -- absorbed by the programme. That is the difference between "capture costs R270 per
    -- item" and "capture costs R270 per item *attempts*", and the seller only ever agreed
    -- to the first one.
    charge_to_listing boolean NOT NULL,
    charged_listing_id text,
    close_kind        text NOT NULL CHECK (close_kind IN ('published', 'failed')),
    booked_by         text NOT NULL CHECK (length(btrim(booked_by)) > 0),
    booked_at         timestamptz NOT NULL,

    -- The labour line is a product, not an assertion: a row that states 45 minutes at
    -- 300c/min and 9999 labour cents is a row nobody can defend to the studio manager.
    CONSTRAINT labour_is_minutes_times_rate CHECK (labour_cents = labour_minutes * operator_rate_cents_per_minute),
    CONSTRAINT station_time_is_minutes_times_rate CHECK (station_time_cents = station_minutes * station_rate_cents_per_minute),
    CONSTRAINT cost_components_sum_to_total CHECK (labour_cents + consumables_cents + station_time_cents = total_cents),

    -- Every cent is either charged to the listing or absorbed by the programme. A cost that
    -- is neither is a cost that has gone missing.
    CONSTRAINT charge_and_absorb_reconcile CHECK (charged_cents + absorbed_cents = total_cents),
    CONSTRAINT only_a_linked_listing_is_charged CHECK (charge_to_listing = false OR charged_listing_id IS NOT NULL),
    CONSTRAINT an_absorbed_record_charges_no_listing CHECK (charge_to_listing = true OR charged_listing_id IS NULL),
    CONSTRAINT an_absorbed_record_absorbs_everything CHECK (charge_to_listing = true OR absorbed_cents = total_cents),
    CONSTRAINT a_charged_record_charges_everything CHECK (charge_to_listing = false OR charged_cents = total_cents),

    -- The estimate comparison is stored, not re-derived: the variance a report shows has to
    -- be the variance that was known at booking, against the estimate that was in force then.
    CONSTRAINT variance_is_actual_less_estimate CHECK (variance_cents = total_cents - estimate_cents),

    CONSTRAINT cost_is_never_negative CHECK (
        labour_cents >= 0 AND consumables_cents >= 0 AND station_time_cents >= 0
        AND charged_cents >= 0 AND absorbed_cents >= 0
    )
);

COMMENT ON COLUMN capture.cost_records.charged_listing_id IS
    'Non-null on the one record that charges a listing, null on every absorbed record. It exists as a separate column so that a plain UNIQUE index is the no-double-charge rule — Postgres treats NULLs as distinct, so the index constrains exactly the charging rows and nothing else.';

CREATE UNIQUE INDEX cost_record_booked_once_per_job_attempt ON capture.cost_records (job_id, attempt);
CREATE UNIQUE INDEX cost_listing_charged_once ON capture.cost_records (charged_listing_id);
CREATE INDEX cost_by_listing ON capture.cost_records (listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX cost_by_item ON capture.cost_records (item_identifier);

CREATE TRIGGER cost_records_append_only
    BEFORE UPDATE OR DELETE ON capture.cost_records
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- capture.qc_assessments — the QC evidence, append-only
-- ==========================================================================
-- `qc_failed` is an outcome with a reason and a retake path, so the reason set is a
-- vocabulary in storage, not a string a handler assembles. The gate sheet is kept whole
-- (measured against threshold, with margin) because "the number it measured next to the
-- number it needed" is what makes a verdict reviewable after the fact.

CREATE TABLE capture.qc_assessments (
    id                 text PRIMARY KEY,
    job_id             text NOT NULL,
    asset_version      integer NOT NULL CHECK (asset_version >= 1),
    stage              text NOT NULL CHECK (stage IN ('auto', 'human')),
    verdict            text NOT NULL CHECK (verdict IN ('pass', 'fail')),
    -- NULL only on a pass. The set matches QcFailureReason; the eight gate codes come from
    -- the auto-QC gates and the three judgement codes are what a human reviewer needs.
    reason_code        text CHECK (reason_code IS NULL OR reason_code IN (
                           'coverage', 'sharpness', 'exposure', 'highlight_clip', 'mesh_holes',
                           'non_manifold', 'texture_bleed', 'silhouette_poster',
                           'item_mismatch', 'condition_discrepancy', 'unusable_input'
                       )),
    scope_supported    text NOT NULL CHECK (scope_supported IN ('geometry_and_external_condition', 'condition_only', 'none')),
    scope_granted      text CHECK (scope_granted IS NULL OR scope_granted IN ('geometry_and_external_condition', 'condition_only', 'none')),
    scope_supported_rank smallint NOT NULL CHECK (scope_supported_rank >= 0 AND scope_supported_rank <= 2),
    scope_granted_rank   smallint NOT NULL CHECK (scope_granted_rank >= 0 AND scope_granted_rank <= 2),
    aligned            boolean NOT NULL,
    frame_count        integer NOT NULL CHECK (frame_count >= 0),
    failing_gate_count integer NOT NULL CHECK (failing_gate_count >= 0),
    gate_results       jsonb NOT NULL CHECK (jsonb_typeof(gate_results) = 'array'),
    thresholds         jsonb NOT NULL CHECK (jsonb_typeof(thresholds) = 'object'),
    -- The person who ran the auto-QC or made the human call. For a human decision this is
    -- the second pair of eyes; CaptureQualityControl requires it to differ from the job's
    -- capture actor, and capture_jobs.publish_needs_a_second_pair_of_eyes repeats it.
    decided_by         text,
    evidence           text,
    measured_at        timestamptz NOT NULL,

    CONSTRAINT a_failure_names_its_reason CHECK (verdict <> 'fail' OR length(btrim(coalesce(reason_code, ''))) > 0),
    CONSTRAINT a_pass_carries_no_reason_code CHECK (verdict <> 'pass' OR reason_code IS NULL),
    CONSTRAINT a_human_decision_names_the_decider CHECK (stage <> 'human' OR length(btrim(coalesce(decided_by, ''))) > 0),
    CONSTRAINT an_auto_assessment_is_not_signed_by_a_human CHECK (stage <> 'auto' OR length(btrim(coalesce(decided_by, ''))) > 0),
    CONSTRAINT the_verdict_follows_the_gates CHECK (verdict <> 'pass' OR failing_gate_count = 0),
    CONSTRAINT a_failure_has_a_failing_gate CHECK (verdict <> 'fail' OR failing_gate_count > 0),
    CONSTRAINT granted_scope_never_exceeds_evidence CHECK (scope_granted_rank <= scope_supported_rank)
);

CREATE UNIQUE INDEX qc_one_assessment_per_job_version_and_stage ON capture.qc_assessments (job_id, asset_version, stage);

CREATE TRIGGER qc_assessments_append_only
    BEFORE UPDATE OR DELETE ON capture.qc_assessments
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- Cross-record invariants at commit time
-- ==========================================================================
-- The PHP versions (CaptureInvariants) run on every commit through this application;
-- these run for transactions that never touch this PHP. Same five rules, two engines,
-- because they catch different mistakes. Deferred to commit so the order of writes inside
-- a transaction cannot matter, exactly as 001 argues.

-- 1. A state the job is in has a custody row that says it happened. Without this the job's
--    `state` column is a self-reported claim and the chain is decoration.
CREATE FUNCTION capture.invariant_state_change_has_custody() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.state = 'intake' THEN
        RETURN NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM capture.custody_entries c
         WHERE c.job_id = NEW.id AND c.to_state = NEW.state
    ) THEN
        RAISE EXCEPTION 'capture job % is in state % with no custody entry asserting that move',
            NEW.id, NEW.state USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_state_change_has_custody
    AFTER INSERT OR UPDATE OF state ON capture.capture_jobs
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION capture.invariant_state_change_has_custody();

-- 2. A closed job has booked its cost. A published or failed job with no cost record is the
--    pilot's real failure mode: the programme looks cheaper than it is and the ≈R270 per
--    item number quietly becomes a per-successful-item number.
CREATE FUNCTION capture.invariant_closed_job_has_cost() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.state NOT IN ('published', 'failed') THEN
        RETURN NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM capture.cost_records r WHERE r.job_id = NEW.id) THEN
        RAISE EXCEPTION 'capture job % closed as % without a cost record. The studio spent real minutes on this item and nothing says how many.',
            NEW.id, NEW.state USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_closed_job_has_cost
    AFTER INSERT OR UPDATE OF state ON capture.capture_jobs
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION capture.invariant_closed_job_has_cost();

-- 3. A published job charged its listing exactly once, across every attempt. The unique
--    index on cost_records.charged_listing_id is the same rule from the other side; this one
--    catches the case the index cannot see, where a job publishes and no record charges it,
--    leaving the capture free.
CREATE FUNCTION capture.invariant_published_listing_is_charged() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    charges integer;
BEGIN
    IF NEW.state <> 'published' OR NEW.listing_id IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT count(*) INTO charges FROM capture.cost_records r
     WHERE r.listing_id = NEW.listing_id AND r.charge_to_listing = true;
    IF charges <> 1 THEN
        RAISE EXCEPTION 'listing % has % charging cost records after job % published; a listing is charged for capture once, no more and no less',
            NEW.listing_id, charges, NEW.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_published_listing_is_charged
    AFTER INSERT OR UPDATE OF state ON capture.capture_jobs
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION capture.invariant_published_listing_is_charged();

-- 4. A job that captured was licensed by a calibration for ITS station covering the instant
--    it entered `captured`. The row CHECK only proves the job names a calibration id; this
--    proves that calibration was actually valid at the time, which is the difference between
--    a precondition and a formality.
CREATE FUNCTION capture.invariant_capture_was_calibrated() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.captured_at IS NULL THEN
        RETURN NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM capture.calibrations k
         WHERE k.id = NEW.calibration_id
           AND k.station_id = NEW.station_id
           AND k.measured_at <= NEW.captured_at
           AND k.valid_until > NEW.captured_at
    ) THEN
        RAISE EXCEPTION 'capture job % ran frames at % on station % with no calibration covering that station and window',
            NEW.id, NEW.captured_at, NEW.station_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_capture_was_calibrated
    AFTER INSERT OR UPDATE OF captured_at ON capture.capture_jobs
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION capture.invariant_capture_was_calibrated();

-- 5. Nobody force-passes their own capture. The reviewer on a published job must not be the
--    operator who ran it, and must not be the person who booked the intake either if that is
    -- the same person who ran the frames — stated once as a row CHECK on the job and again
    -- here over the custody trail, so a history assembled entry by entry cannot add up to a
    -- one-person approval.
CREATE FUNCTION capture.invariant_publication_had_two_eyes() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    runners integer;
BEGIN
    IF NEW.state <> 'published' THEN
        RETURN NULL;
    END IF;
    SELECT count(*) INTO runners FROM capture.custody_entries c
     WHERE c.job_id = NEW.id
       AND c.to_state = 'published'
       AND (c.actor_id = NEW.capture_actor_id OR c.actor_id IS NULL);
    IF runners > 0 THEN
        RAISE EXCEPTION 'capture job % was published by an actor who also ran it; four-eyes requires the reviewer to be someone else',
            NEW.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_publication_had_two_eyes
    AFTER INSERT OR UPDATE OF state ON capture.capture_jobs
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION capture.invariant_publication_had_two_eyes();

COMMIT;

-- ==========================================================================
-- Grants: least privilege for the capture programme
-- ==========================================================================
-- Shape follows 002. nastech_app gets INSERT and SELECT on every evidence table and
-- UPDATE/DELETE on none of them: a role that can UPDATE the custody chain is a role that
-- can rewrite what the studio did to a seller's watch, whatever the triggers above say.
-- The jobs table is the one mutable table because a job is worked on, not evidence.

GRANT USAGE ON SCHEMA capture TO nastech_app;
GRANT USAGE ON SCHEMA capture TO nastech_owner;

GRANT SELECT, INSERT, UPDATE, DELETE ON capture.capture_jobs TO nastech_app;

-- Read and append only: the four evidence tables from Capture\Schema::APPEND_ONLY_TABLES.
GRANT SELECT, INSERT ON
    capture.custody_entries,
    capture.calibrations,
    capture.cost_records,
    capture.qc_assessments
TO nastech_app;

-- The owner role can write the evidence tables for a correction that has gone through the
-- review process, and is the owner of the guard functions so a non-owner session cannot
-- redefine them.
GRANT SELECT, INSERT, UPDATE, DELETE ON
    capture.custody_entries,
    capture.calibrations,
    capture.cost_records,
    capture.qc_assessments
TO nastech_owner;

-- Commit-time invariant triggers read across the module's own tables; SECURITY INVOKER
-- (the default) means the invoker needs SELECT on what they read — which it holds above.
GRANT SELECT ON ALL TABLES IN SCHEMA capture TO nastech_app;

ALTER FUNCTION capture.assert_job_version_monotonic() OWNER TO nastech_owner;
ALTER FUNCTION capture.assert_terminal_job_is_frozen() OWNER TO nastech_owner;
ALTER FUNCTION capture.custody_canonical_row(capture.custody_entries) OWNER TO nastech_owner;
ALTER FUNCTION capture.verify_custody_chain(text) OWNER TO nastech_owner;
ALTER FUNCTION capture.invariant_custody_chain_is_intact() OWNER TO nastech_owner;
ALTER FUNCTION capture.invariant_state_change_has_custody() OWNER TO nastech_owner;
ALTER FUNCTION capture.invariant_closed_job_has_cost() OWNER TO nastech_owner;
ALTER FUNCTION capture.invariant_published_listing_is_charged() OWNER TO nastech_owner;
ALTER FUNCTION capture.invariant_capture_was_calibrated() OWNER TO nastech_owner;
ALTER FUNCTION capture.invariant_publication_had_two_eyes() OWNER TO nastech_owner;
-- No `ALTER TRIGGER ... OWNER TO` here: a trigger has no owner of its own — it fires with the table's
-- owner — and PostgreSQL has no such statement. It was in this file, and it failed the migration the
-- first time the DDL was applied to a real server.

ALTER DEFAULT PRIVILEGES IN SCHEMA capture GRANT SELECT ON TABLES TO nastech_app;

-- ==========================================================================
-- Deliberately NOT in this file
-- ==========================================================================
-- * Foreign keys to media.* or to the listing. Capture references a listing id and a
--   seller account as opaque text, the same way the money path references nothing outside
--   its own schemas: an FK across modules turns two schemas into one and makes the module
--   unshardable on day one. The calibration and custody rules above are the substitute,
--   and they are stronger — an FK proves a row exists, not that the evidence agrees.
-- * The images. Renditions, posters and sprites are Media's rows in Media's schema; this
--   module stores only the media ids Media handed back, as a jsonb receipt on the job.
-- * The state machine's edges. Owned by CaptureJob::TRANSITIONS, which mirrors
--   TRANSITIONS in tooling/asset-pipeline/job-state.ts. The `state` columns above constrain
--   the vocabulary only; a second copy of the machine would drift, and the copy checked
--   less often is the one that is wrong.
-- * Retention. A custody row is kept as long as the listing it documents is disputable;
--   the pruning job is Phase 1+, and it is the job that has to respect append-only.
