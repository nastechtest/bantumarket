-- NasTech Market — reporting read models, PostgreSQL DDL (migration 013)
--
-- Owns schema `reporting`. Written against src/Reporting/Schema.php and the
-- report catalogue in src/Reporting/ReportName.php.
--
-- WHAT THIS SCHEMA IS, AND IS NOT
-- Every table here is a projection of outbox events. Nothing queries another
-- module's schema: Reporting has no outbound edges, and the brief's earlier
-- suggestion of SQL views over `commissions.commission_entries` and
-- `settlements.ledger_entries` would have made Reporting a second reader of two
-- schemas it does not own. The shared rule (read another module only through an
-- interface or an event) and the quality bar (SQL never reaches into another
-- schema) win; the conflict is recorded in README.md and the brief-62 report.
--
-- The way a report stays reconciled to the ledger is therefore event-per-row:
-- `LedgerEntryRecorded` and `CommissionEntryRecorded` carry the entry id, the
-- signed amount and the order. A producer that publishes only a total cannot be
-- reconciled, and the projector refuses to invent the missing rows.
--
-- AS-OF AND LATE EVENTS
-- Every view joins `reporting.report_snapshots` and filters each fact table on
-- BOTH `occurred_at <= as_of` and `ingested_at <= ingested_through`. An event
-- that occurred before as_of but arrived after the snapshot closed is excluded
-- from that snapshot and included in a later one. There is no "latest" view:
-- a finance number without a snapshot id is not a number this schema produces.
--
-- STATE: not executed against a real server. There is no PostgreSQL in this
-- environment. `psql -v ON_ERROR_STOP=1` remains a deploy gate, as for 001.

BEGIN;

CREATE SCHEMA reporting;

COMMENT ON SCHEMA reporting IS
    'Event-sourced read models. No outbound edges: every fact arrives through the transactional outbox. Reports are views pinned to a report_snapshots row.';

-- ==========================================================================
-- Projection bookkeeping
-- ==========================================================================

CREATE TABLE reporting.projected_events (
    id            text PRIMARY KEY,
    event_id      text NOT NULL,
    event_type    text NOT NULL,
    aggregate_id  text NOT NULL DEFAULT '',
    occurred_at   timestamptz NOT NULL,
    ingested_at   timestamptz NOT NULL,
    applied_at    timestamptz NOT NULL,
    outcome       text NOT NULL,

    -- The idempotency rule. An event id may be seen once; a re-delivery is
    -- found here and skipped before a single fact row is written.
    CONSTRAINT projection_event_is_claimed_once UNIQUE (event_id),
    -- IGNORED is recorded, not dropped: an event type Reporting does not yet
    -- project is a known gap, not a missing delivery.
    CONSTRAINT projection_outcome_is_known CHECK (outcome IN ('APPLIED', 'IGNORED')),
    -- A projection cannot have applied an event after the instant it says it
    -- applied it; clock skew that inverted these would corrupt every snapshot.
    CONSTRAINT projection_ingest_follows_occurrence CHECK (ingested_at >= occurred_at)
);

CREATE TABLE reporting.projection_state (
    id                 text PRIMARY KEY,
    applied_events     bigint NOT NULL,
    ignored_events     bigint NOT NULL,
    -- NULL only for the empty projection; a non-null value is the watermark
    -- snapshots use.
    last_occurred_at   timestamptz,
    last_ingested_at   timestamptz,
    -- NULL only when no event has ever been applied. The string is the outbox
    -- message id, kept so an operator can find the last row applied.
    last_event_id      text,

    CONSTRAINT projection_counters_are_not_negative CHECK (applied_events >= 0 AND ignored_events >= 0)
);

COMMENT ON COLUMN reporting.projection_state.last_occurred_at IS
    'Business time of the newest event applied. NULL = empty projection, never "unknown".';
COMMENT ON COLUMN reporting.projection_state.last_ingested_at IS
    'Ingestion watermark. Every report_snapshot.ingested_through is copied from here.';

-- ==========================================================================
-- Seller cohort: the design written down once
-- ==========================================================================

CREATE TABLE reporting.seller_cohorts (
    id            text PRIMARY KEY,
    seller_id     text NOT NULL,
    city          text NOT NULL,
    -- ISO week, e.g. 2026-W43. The cohort is fixed at onboarding; a seller who
    -- moves city or joins the pilot later does not move between cohorts, because
    -- every exit test is a before/after comparison against this row.
    cohort_week   text NOT NULL,
    pilot_capture boolean NOT NULL DEFAULT false,
    joined_at     timestamptz NOT NULL,
    ingested_at   timestamptz NOT NULL,

    CONSTRAINT cohorts_one_per_seller UNIQUE (seller_id),
    CONSTRAINT cohort_week_is_iso CHECK (cohort_week ~ '^\d{4}-W\d{2}$'),
    CONSTRAINT cohort_city_is_present CHECK (length(btrim(city)) > 0)
);

-- ==========================================================================
-- Listing facts
-- ==========================================================================

CREATE TABLE reporting.listing_facts (
    id                  text PRIMARY KEY,
    listing_id          text NOT NULL,
    seller_id           text NOT NULL,
    category_id         text NOT NULL,
    city                text NOT NULL,
    created_at          timestamptz NOT NULL,
    created_ingested_at timestamptz NOT NULL,
    -- NULL = not live *at this snapshot*. A listing that is live now but went
    -- live after an old as_of is correctly absent from that snapshot.
    live_at             timestamptz,
    live_ingested_at    timestamptz,
    -- NULL = no media attached yet. first_media_at is the first attachment,
    -- never the latest: media coverage asks whether a buyer had a photo to look
    -- at, not how many were uploaded eventually.
    first_media_at      timestamptz,
    media_ingested_at   timestamptz,
    media_count         integer NOT NULL DEFAULT 0,
    currency            char(3) NOT NULL DEFAULT 'ZAR',
    last_ingested_at    timestamptz NOT NULL,

    CONSTRAINT listing_one_row_per_listing UNIQUE (listing_id),
    CONSTRAINT listing_fact_dates_are_ordered CHECK (
        (live_at IS NULL OR live_at >= created_at)
        AND (first_media_at IS NULL OR first_media_at >= created_at)
    ),
    CONSTRAINT listing_media_count_is_not_negative CHECK (media_count >= 0),
    CONSTRAINT currency_is_iso CHECK (currency ~ '^[A-Z]{3}$')
);

-- ==========================================================================
-- Search demand
-- ==========================================================================

CREATE TABLE reporting.search_facts (
    id           text PRIMARY KEY,
    query_id     text NOT NULL,
    category_id  text NOT NULL,
    result_count integer NOT NULL,
    occurred_at  timestamptz NOT NULL,
    ingested_at  timestamptz NOT NULL,

    CONSTRAINT search_query_is_claimed_once UNIQUE (query_id),
    CONSTRAINT search_result_count_is_not_negative CHECK (result_count >= 0)
);

-- ==========================================================================
-- Orders: lifecycle markers, never a commission derivation
-- ==========================================================================

CREATE TABLE reporting.order_facts (
    id                   text PRIMARY KEY,
    order_id             text NOT NULL,
    seller_id            text NOT NULL,
    -- NULL where the listing was withdrawn before the order was projected, and
    -- for historical orders that predate the attribution event. NULL means
    -- "not known to this projection", never "no listing".
    listing_id           text,
    -- The inspection session that bought, when the order was attributed to one.
    -- NULL is the normal case for a direct purchase.
    viewer_session_id    text,
    gross_cents          bigint NOT NULL,
    currency             char(3) NOT NULL,
    paid_at              timestamptz NOT NULL,
    paid_ingested_at     timestamptz NOT NULL,
    -- NULL = not completed at this snapshot. GMV counts only completed orders.
    completed_at         timestamptz,
    completed_ingested_at timestamptz,
    refunded_at          timestamptz,
    refunded_ingested_at timestamptz,
    refunded_cents       bigint NOT NULL DEFAULT 0,
    last_ingested_at     timestamptz NOT NULL,

    CONSTRAINT order_one_row_per_order UNIQUE (order_id),
    CONSTRAINT order_gross_is_not_negative CHECK (gross_cents >= 0),
    CONSTRAINT refund_does_not_exceed_gross CHECK (refunded_cents >= 0 AND refunded_cents <= gross_cents),
    CONSTRAINT order_completion_follows_payment CHECK (completed_at IS NULL OR completed_at >= paid_at),
    CONSTRAINT currency_is_iso CHECK (currency ~ '^[A-Z]{3}$')
);

-- ==========================================================================
-- Money evidence
-- ==========================================================================

CREATE TABLE reporting.commission_facts (
    id             text PRIMARY KEY,
    entry_id       text NOT NULL,
    order_id       text NOT NULL,
    seller_id      text NOT NULL,
    kind           text NOT NULL,
    -- Signed: forward positive, reversal negative. The sign is the evidence;
    -- storing both as positive and applying a rule at query time is how a
    -- reversal is double-counted.
    amount_cents   bigint NOT NULL,
    currency       char(3) NOT NULL,
    -- The ledger entry this evidence produced. NULL only when the commission is
    -- zero (a promotional policy still records evidence, but no money moved).
    ledger_entry_id text,
    policy_id      text,
    occurred_at    timestamptz NOT NULL,
    ingested_at    timestamptz NOT NULL,

    CONSTRAINT commission_entry_is_claimed_once UNIQUE (entry_id),
    CONSTRAINT commission_sign_follows_kind CHECK (
        (kind = 'FORWARD' AND amount_cents >= 0)
        OR (kind = 'REVERSAL' AND amount_cents <= 0)
    ),
    -- Any non-zero commission must name the ledger row behind it; a charge with
    -- no money row is the orphan the reconciliation report would chase forever.
    CONSTRAINT commission_fact_has_evidence CHECK (amount_cents = 0 OR ledger_entry_id IS NOT NULL),
    CONSTRAINT currency_is_iso CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE TABLE reporting.ledger_facts (
    id            text PRIMARY KEY,
    entry_id      text NOT NULL,
    seller_id     text NOT NULL,
    -- NULL for seller-level rows such as PAYOUT. NULL is meaningful: the row is
    -- not attributable to an order and must not be joined to one.
    order_id      text,
    entry_type    text NOT NULL,
    amount_cents  bigint NOT NULL,
    currency      char(3) NOT NULL,
    reversal_of   text,
    occurred_at   timestamptz NOT NULL,
    ingested_at   timestamptz NOT NULL,

    CONSTRAINT ledger_entry_is_claimed_once UNIQUE (entry_id),
    CONSTRAINT ledger_amount_is_not_zero CHECK (amount_cents <> 0),
    CONSTRAINT ledger_type_is_known CHECK (entry_type IN (
        'SELLER_EARNINGS', 'COMMISSION', 'COMMISSION_REVERSAL', 'REFUND',
        'PAYOUT', 'CHARGEBACK', 'HOLD', 'HOLD_RELEASE'
    )),
    CONSTRAINT currency_is_iso CHECK (currency ~ '^[A-Z]{3}$')
);

-- ==========================================================================
-- Payouts
-- ==========================================================================

CREATE TABLE reporting.payout_line_facts (
    id                text PRIMARY KEY,
    batch_id          text NOT NULL,
    seller_id         text NOT NULL,
    amount_cents      bigint NOT NULL,
    currency          char(3) NOT NULL,
    oldest_payable_at timestamptz NOT NULL,
    -- NULL for a dead batch: nothing left the bank, so there is no release
    -- instant. The latency report filters to RELEASED and never treats NULL as
    -- zero seconds.
    released_at       timestamptz,
    status            text NOT NULL,
    occurred_at       timestamptz NOT NULL,
    ingested_at       timestamptz NOT NULL,

    CONSTRAINT payout_one_row_per_batch_seller UNIQUE (batch_id, seller_id),
    CONSTRAINT payout_amount_is_positive CHECK (amount_cents > 0),
    CONSTRAINT payout_status_is_known CHECK (status IN ('RELEASED', 'DEAD')),
    CONSTRAINT payout_released_after_payable CHECK (released_at IS NULL OR released_at >= oldest_payable_at),
    CONSTRAINT currency_is_iso CHECK (currency ~ '^[A-Z]{3}$')
);

-- ==========================================================================
-- Disputes
-- ==========================================================================

CREATE TABLE reporting.dispute_facts (
    id                  text PRIMARY KEY,
    case_id             text NOT NULL,
    order_id            text NOT NULL,
    kind                text NOT NULL,
    opened_at           timestamptz NOT NULL,
    opened_ingested_at  timestamptz NOT NULL,
    decided_at          timestamptz,
    decided_ingested_at timestamptz,
    -- NULL = still open. Open cases are deliberately not an outcome in the mix.
    outcome             text,

    CONSTRAINT dispute_one_row_per_case UNIQUE (case_id),
    CONSTRAINT dispute_outcome_is_known CHECK (
        outcome IS NULL OR outcome IN ('BUYER_FAVOUR', 'SELLER_FAVOUR', 'SPLIT', 'WITHDRAWN')
    ),
    CONSTRAINT dispute_decision_follows_open CHECK (decided_at IS NULL OR decided_at >= opened_at)
);

-- ==========================================================================
-- Capture
-- ==========================================================================

CREATE TABLE reporting.capture_facts (
    id                  text PRIMARY KEY,
    job_id              text NOT NULL,
    item_id             text NOT NULL,
    state               text NOT NULL,
    -- NULL = no cost booked yet. The cost report counts published jobs with a
    -- non-null cost and ignores the rest rather than pricing them at zero.
    cost_cents          bigint,
    currency            char(3) NOT NULL DEFAULT 'ZAR',
    changed_at          timestamptz NOT NULL,
    changed_ingested_at timestamptz NOT NULL,
    last_ingested_at    timestamptz NOT NULL,

    CONSTRAINT capture_one_row_per_job UNIQUE (job_id),
    CONSTRAINT capture_state_is_known CHECK (state IN (
        'intake', 'captured', 'processed', 'qc_auto', 'qc_human', 'published', 'failed', 'reshot'
    )),
    CONSTRAINT capture_cost_is_not_negative CHECK (cost_cents IS NULL OR cost_cents >= 0),
    CONSTRAINT currency_is_iso CHECK (currency ~ '^[A-Z]{3}$')
);

-- ==========================================================================
-- Inspection views
-- ==========================================================================

CREATE TABLE reporting.inspection_facts (
    id          text PRIMARY KEY,
    view_id     text NOT NULL,
    listing_id  text NOT NULL,
    session_id  text NOT NULL,
    -- false is the non-3D path and is a first-class citizen: the conversion
    -- report must be computable where the scene runtime never loaded.
    used_3d     boolean NOT NULL DEFAULT false,
    viewed_at   timestamptz NOT NULL,
    ingested_at timestamptz NOT NULL,

    CONSTRAINT inspection_view_is_claimed_once UNIQUE (view_id)
);

-- ==========================================================================
-- Snapshots and runs
-- ==========================================================================

CREATE TABLE reporting.report_snapshots (
    id               text PRIMARY KEY,
    as_of            timestamptz NOT NULL,
    ingested_through timestamptz NOT NULL,
    closed_at        timestamptz NOT NULL,

    CONSTRAINT snapshot_knows_nothing_from_the_future CHECK (ingested_through <= closed_at)
);

COMMENT ON COLUMN reporting.report_snapshots.as_of IS
    'Business-time cutoff. Every view filters occurred_at <= as_of.';
COMMENT ON COLUMN reporting.report_snapshots.ingested_through IS
    'Ingestion watermark. Every view filters ingested_at <= ingested_through. A late event (occurred before as_of, ingested after this) is excluded from this snapshot by construction.';

CREATE TABLE reporting.report_runs (
    id           text PRIMARY KEY,
    report_name  text NOT NULL,
    snapshot_id  text NOT NULL,
    row_count    integer NOT NULL,
    truncated    boolean NOT NULL DEFAULT false,
    generated_at timestamptz NOT NULL,

    CONSTRAINT report_row_count_is_not_negative CHECK (row_count >= 0)
);

-- ==========================================================================
-- Append-only evidence
-- ==========================================================================
-- A projection row that can be edited after the fact is a second ledger with
-- no triggers. Lifecycle tables (listing_facts, order_facts, dispute_facts,
-- capture_facts, projection_state) are mutable by design; everything below is
-- written once.

CREATE TRIGGER projected_events_append_only
    BEFORE UPDATE OR DELETE ON reporting.projected_events
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();
CREATE TRIGGER search_facts_append_only
    BEFORE UPDATE OR DELETE ON reporting.search_facts
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();
CREATE TRIGGER commission_facts_append_only
    BEFORE UPDATE OR DELETE ON reporting.commission_facts
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();
CREATE TRIGGER ledger_facts_append_only
    BEFORE UPDATE OR DELETE ON reporting.ledger_facts
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();
CREATE TRIGGER payout_line_facts_append_only
    BEFORE UPDATE OR DELETE ON reporting.payout_line_facts
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();
CREATE TRIGGER inspection_facts_append_only
    BEFORE UPDATE OR DELETE ON reporting.inspection_facts
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();
CREATE TRIGGER report_snapshots_append_only
    BEFORE UPDATE OR DELETE ON reporting.report_snapshots
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();
CREATE TRIGGER report_runs_append_only
    BEFORE UPDATE OR DELETE ON reporting.report_runs
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- Views
-- ==========================================================================
-- Every view is snapshot-parameterised by a join to report_snapshots. There is
-- deliberately no view that answers "now": a report is a projection with a
-- stated as-of.

CREATE VIEW reporting.v_listings_created AS
SELECT s.id AS snapshot_id, s.as_of, s.ingested_through,
       to_char(f.created_at AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS week,
       f.category_id,
       count(*)::bigint AS listings_created
FROM reporting.report_snapshots s
JOIN reporting.listing_facts f
  ON f.created_at <= s.as_of AND f.created_ingested_at <= s.ingested_through
GROUP BY s.id, s.as_of, s.ingested_through, week, f.category_id;

CREATE VIEW reporting.v_listings_live AS
SELECT s.id AS snapshot_id, s.as_of, s.ingested_through,
       count(*)::bigint AS live_listings,
       count(*) FILTER (
           WHERE f.first_media_at IS NOT NULL
             AND f.first_media_at <= s.as_of
             AND f.media_ingested_at <= s.ingested_through
       )::bigint AS live_with_media,
       (10000 * count(*) FILTER (
           WHERE f.first_media_at IS NOT NULL
             AND f.first_media_at <= s.as_of
             AND f.media_ingested_at <= s.ingested_through
       ) + count(*) / 2) / NULLIF(count(*), 0) AS media_coverage_bps
FROM reporting.report_snapshots s
JOIN reporting.listing_facts f
  ON f.live_at <= s.as_of AND f.live_ingested_at <= s.ingested_through
GROUP BY s.id, s.as_of, s.ingested_through;

CREATE VIEW reporting.v_listing_to_live_conversion AS
WITH created AS (
    SELECT s.id AS snapshot_id, f.category_id, count(*)::bigint AS created
    FROM reporting.report_snapshots s
    JOIN reporting.listing_facts f
      ON f.created_at <= s.as_of AND f.created_ingested_at <= s.ingested_through
    GROUP BY s.id, f.category_id
), live AS (
    SELECT s.id AS snapshot_id, f.category_id, count(*)::bigint AS live
    FROM reporting.report_snapshots s
    JOIN reporting.listing_facts f
      ON f.live_at <= s.as_of AND f.live_ingested_at <= s.ingested_through
    GROUP BY s.id, f.category_id
)
SELECT c.snapshot_id, c.category_id, c.created, COALESCE(l.live, 0) AS live,
       (10000 * COALESCE(l.live, 0) + c.created / 2) / NULLIF(c.created, 0) AS conversion_bps
FROM created c
LEFT JOIN live l ON l.snapshot_id = c.snapshot_id AND l.category_id = c.category_id;

CREATE VIEW reporting.v_time_to_first_listing AS
WITH first_listing AS (
    SELECT f.seller_id, min(f.created_at) AS first_created_at
    FROM reporting.listing_facts f
    GROUP BY f.seller_id
), cohort AS (
    SELECT s.id AS snapshot_id, c.cohort_week, c.city, c.pilot_capture, c.seller_id, c.joined_at,
           f.first_created_at
    FROM reporting.report_snapshots s
    JOIN reporting.seller_cohorts c
      ON c.joined_at <= s.as_of AND c.ingested_at <= s.ingested_through
    LEFT JOIN first_listing f ON f.seller_id = c.seller_id AND f.first_created_at <= s.as_of
)
SELECT snapshot_id, cohort_week, city, pilot_capture,
       count(*)::bigint AS sellers,
       count(first_created_at)::bigint AS sellers_with_listing,
       (sum(GREATEST(0, floor(extract(epoch FROM (first_created_at - joined_at)) / 3600)))::bigint
           + count(first_created_at) / 2) / NULLIF(count(first_created_at), 0) AS avg_hours_to_first_listing,
       (10000 * count(*) FILTER (
           WHERE first_created_at IS NOT NULL
             AND first_created_at <= joined_at + interval '7 days'
       ) + count(*) / 2) / NULLIF(count(*), 0) AS first_listing_within_7_days_bps
FROM cohort
GROUP BY snapshot_id, cohort_week, city, pilot_capture;

CREATE VIEW reporting.v_search_zero_results AS
SELECT s.id AS snapshot_id, f.category_id,
       count(*)::bigint AS queries,
       count(*) FILTER (WHERE f.result_count = 0)::bigint AS zero_result_queries,
       (10000 * count(*) FILTER (WHERE f.result_count = 0) + count(*) / 2) / NULLIF(count(*), 0) AS zero_result_rate_bps
FROM reporting.report_snapshots s
JOIN reporting.search_facts f
  ON f.occurred_at <= s.as_of AND f.ingested_at <= s.ingested_through
GROUP BY s.id, f.category_id;

CREATE VIEW reporting.v_gmv AS
SELECT s.id AS snapshot_id, o.currency,
       count(*)::bigint AS completed_orders,
       sum(o.gross_cents)::bigint AS gmv_cents,
       sum(CASE WHEN o.refunded_at IS NOT NULL AND o.refunded_at <= s.as_of
                     AND o.refunded_ingested_at <= s.ingested_through
                THEN o.refunded_cents ELSE 0 END)::bigint AS refunded_cents,
       (sum(o.gross_cents) - sum(CASE WHEN o.refunded_at IS NOT NULL AND o.refunded_at <= s.as_of
                     AND o.refunded_ingested_at <= s.ingested_through
                THEN o.refunded_cents ELSE 0 END))::bigint AS net_gmv_cents
FROM reporting.report_snapshots s
JOIN reporting.order_facts o
  ON o.completed_at <= s.as_of AND o.completed_ingested_at <= s.ingested_through
GROUP BY s.id, o.currency;

CREATE VIEW reporting.v_commission_accrued AS
WITH commission AS (
    SELECT s.id AS snapshot_id, c.currency,
           sum(CASE WHEN c.kind = 'FORWARD' THEN c.amount_cents ELSE 0 END)::bigint AS forward_cents,
           sum(CASE WHEN c.kind = 'REVERSAL' THEN -c.amount_cents ELSE 0 END)::bigint AS reversal_cents,
           sum(c.amount_cents)::bigint AS net_cents
    FROM reporting.report_snapshots s
    JOIN reporting.commission_facts c
      ON c.occurred_at <= s.as_of AND c.ingested_at <= s.ingested_through
    GROUP BY s.id, c.currency
), ledger AS (
    SELECT s.id AS snapshot_id, l.currency,
           sum(-l.amount_cents)::bigint AS ledger_net_cents
    FROM reporting.report_snapshots s
    JOIN reporting.ledger_facts l
      ON l.occurred_at <= s.as_of AND l.ingested_at <= s.ingested_through
    WHERE l.entry_type IN ('COMMISSION', 'COMMISSION_REVERSAL')
    GROUP BY s.id, l.currency
)
SELECT COALESCE(c.snapshot_id, l.snapshot_id) AS snapshot_id,
       COALESCE(c.currency, l.currency) AS currency,
       COALESCE(c.forward_cents, 0) AS forward_cents,
       COALESCE(c.reversal_cents, 0) AS reversal_cents,
       COALESCE(c.net_cents, 0) AS net_cents,
       COALESCE(l.ledger_net_cents, 0) AS ledger_net_cents,
       COALESCE(c.net_cents, 0) - COALESCE(l.ledger_net_cents, 0) AS delta_cents
FROM commission c
FULL OUTER JOIN ledger l ON l.snapshot_id = c.snapshot_id AND l.currency = c.currency;

CREATE VIEW reporting.v_take_rate AS
WITH gmv AS (
    SELECT s.id AS snapshot_id, o.currency,
           sum(o.gross_cents)::bigint - sum(CASE WHEN o.refunded_at IS NOT NULL
                AND o.refunded_at <= s.as_of AND o.refunded_ingested_at <= s.ingested_through
                THEN o.refunded_cents ELSE 0 END)::bigint AS net_gmv_cents
    FROM reporting.report_snapshots s
    JOIN reporting.order_facts o
      ON o.completed_at <= s.as_of AND o.completed_ingested_at <= s.ingested_through
    GROUP BY s.id, o.currency
), commission AS (
    SELECT s.id AS snapshot_id, c.currency, sum(c.amount_cents)::bigint AS commission_net_cents
    FROM reporting.report_snapshots s
    JOIN reporting.commission_facts c
      ON c.occurred_at <= s.as_of AND c.ingested_at <= s.ingested_through
    GROUP BY s.id, c.currency
)
SELECT COALESCE(g.snapshot_id, c.snapshot_id) AS snapshot_id,
       COALESCE(g.currency, c.currency) AS currency,
       COALESCE(g.net_gmv_cents, 0) AS net_gmv_cents,
       COALESCE(c.commission_net_cents, 0) AS commission_net_cents,
       (10000 * COALESCE(c.commission_net_cents, 0) + COALESCE(g.net_gmv_cents, 0) / 2)
           / NULLIF(COALESCE(g.net_gmv_cents, 0), 0) AS take_rate_bps
FROM gmv g
FULL OUTER JOIN commission c ON c.snapshot_id = g.snapshot_id AND c.currency = g.currency;

CREATE VIEW reporting.v_payout_latency AS
SELECT s.id AS snapshot_id, p.currency,
       count(*)::bigint AS payouts,
       sum(p.amount_cents)::bigint AS amount_cents,
       (sum(extract(epoch FROM (p.released_at - p.oldest_payable_at)))::bigint + count(*) / 2)
           / NULLIF(count(*), 0) AS avg_latency_seconds,
       max(extract(epoch FROM (p.released_at - p.oldest_payable_at)))::bigint AS max_latency_seconds
FROM reporting.report_snapshots s
JOIN reporting.payout_line_facts p
  ON p.released_at IS NOT NULL
 AND p.released_at <= s.as_of
 AND p.ingested_at <= s.ingested_through
WHERE p.status = 'RELEASED'
GROUP BY s.id, p.currency;

CREATE VIEW reporting.v_dispute_rate AS
SELECT s.id AS snapshot_id,
       (SELECT count(*) FROM reporting.order_facts o
         WHERE o.completed_at <= s.as_of AND o.completed_ingested_at <= s.ingested_through)::bigint AS completed_orders,
       (SELECT count(*) FROM reporting.dispute_facts d
         WHERE d.opened_at <= s.as_of AND d.opened_ingested_at <= s.ingested_through)::bigint AS disputes_opened,
       (10000 * (SELECT count(*) FROM reporting.dispute_facts d
         WHERE d.opened_at <= s.as_of AND d.opened_ingested_at <= s.ingested_through)
        + NULLIF((SELECT count(*) FROM reporting.order_facts o
         WHERE o.completed_at <= s.as_of AND o.completed_ingested_at <= s.ingested_through), 0) / 2)
        / NULLIF((SELECT count(*) FROM reporting.order_facts o
         WHERE o.completed_at <= s.as_of AND o.completed_ingested_at <= s.ingested_through), 0) AS dispute_rate_bps
FROM reporting.report_snapshots s;

CREATE VIEW reporting.v_dispute_outcome_mix AS
WITH decided AS (
    SELECT s.id AS snapshot_id, d.outcome
    FROM reporting.report_snapshots s
    JOIN reporting.dispute_facts d
      ON d.decided_at <= s.as_of AND d.decided_ingested_at <= s.ingested_through
    WHERE d.outcome IS NOT NULL
)
SELECT snapshot_id, outcome, count(*)::bigint AS decided,
       (10000 * count(*) + sum(count(*)) OVER (PARTITION BY snapshot_id) / 2)
           / NULLIF(sum(count(*)) OVER (PARTITION BY snapshot_id), 0) AS share_bps
FROM decided
GROUP BY snapshot_id, outcome;

CREATE VIEW reporting.v_capture_jobs_by_state AS
SELECT s.id AS snapshot_id, c.state, count(*)::bigint AS jobs
FROM reporting.report_snapshots s
JOIN reporting.capture_facts c
  ON c.changed_at <= s.as_of AND c.changed_ingested_at <= s.ingested_through
GROUP BY s.id, c.state;

CREATE VIEW reporting.v_capture_cost_per_item AS
WITH costed AS (
    SELECT s.id AS snapshot_id, c.cost_cents
    FROM reporting.report_snapshots s
    JOIN reporting.capture_facts c
      ON c.changed_at <= s.as_of AND c.changed_ingested_at <= s.ingested_through
    WHERE c.state = 'published' AND c.cost_cents IS NOT NULL
)
SELECT snapshot_id,
       count(*)::bigint AS completed_items,
       COALESCE(sum(cost_cents), 0)::bigint AS total_cost_cents,
       (COALESCE(sum(cost_cents), 0) + count(*) / 2) / NULLIF(count(*), 0) AS cost_per_item_cents,
       27000::bigint AS assumption_cents,
       ((COALESCE(sum(cost_cents), 0) + count(*) / 2) / NULLIF(count(*), 0)) - 27000 AS variance_cents,
       ((COALESCE(sum(cost_cents), 0) + count(*) / 2) / NULLIF(count(*), 0)) <= 27000 AS within_assumption
FROM costed
GROUP BY snapshot_id;

CREATE VIEW reporting.v_inspection_to_purchase AS
WITH purchased AS (
    SELECT DISTINCT o.viewer_session_id, o.listing_id
    FROM reporting.order_facts o
    WHERE o.completed_at IS NOT NULL
      AND o.viewer_session_id IS NOT NULL
), views AS (
    SELECT s.id AS snapshot_id, v.used_3d,
           EXISTS (
               SELECT 1 FROM purchased p
               WHERE p.viewer_session_id = v.session_id AND p.listing_id = v.listing_id
           ) AS converted
    FROM reporting.report_snapshots s
    JOIN reporting.inspection_facts v
      ON v.viewed_at <= s.as_of AND v.ingested_at <= s.ingested_through
)
SELECT snapshot_id,
       count(*)::bigint AS views,
       count(*) FILTER (WHERE converted)::bigint AS purchases,
       (10000 * count(*) FILTER (WHERE converted) + count(*) / 2) / NULLIF(count(*), 0) AS conversion_bps,
       count(*) FILTER (WHERE used_3d)::bigint AS views_3d,
       count(*) FILTER (WHERE used_3d AND converted)::bigint AS purchases_3d,
       (10000 * count(*) FILTER (WHERE used_3d AND converted) + NULLIF(count(*) FILTER (WHERE used_3d), 0) / 2)
           / NULLIF(count(*) FILTER (WHERE used_3d), 0) AS conversion_3d_bps,
       count(*) FILTER (WHERE NOT used_3d)::bigint AS views_without_3d,
       count(*) FILTER (WHERE NOT used_3d AND converted)::bigint AS purchases_without_3d,
       (10000 * count(*) FILTER (WHERE NOT used_3d AND converted) + NULLIF(count(*) FILTER (WHERE NOT used_3d), 0) / 2)
           / NULLIF(count(*) FILTER (WHERE NOT used_3d), 0) AS conversion_without_3d_bps
FROM views
GROUP BY snapshot_id;

CREATE VIEW reporting.v_seller_cohorts AS
WITH cohorts AS (
    SELECT s.id AS snapshot_id, c.cohort_week, c.city, c.pilot_capture, c.seller_id
    FROM reporting.report_snapshots s
    JOIN reporting.seller_cohorts c
      ON c.joined_at <= s.as_of AND c.ingested_at <= s.ingested_through
), listings AS (
    SELECT s.id AS snapshot_id, f.seller_id, count(*)::bigint AS listings
    FROM reporting.report_snapshots s
    JOIN reporting.listing_facts f
      ON f.created_at <= s.as_of AND f.created_ingested_at <= s.ingested_through
    GROUP BY s.id, f.seller_id
), gmv AS (
    SELECT s.id AS snapshot_id, o.seller_id, sum(o.gross_cents)::bigint AS gmv_cents
    FROM reporting.report_snapshots s
    JOIN reporting.order_facts o
      ON o.completed_at <= s.as_of AND o.completed_ingested_at <= s.ingested_through
    GROUP BY s.id, o.seller_id
), commission AS (
    SELECT s.id AS snapshot_id, c.seller_id, sum(c.amount_cents)::bigint AS commission_cents
    FROM reporting.report_snapshots s
    JOIN reporting.commission_facts c
      ON c.occurred_at <= s.as_of AND c.ingested_at <= s.ingested_through
    GROUP BY s.id, c.seller_id
)
SELECT c.snapshot_id, c.cohort_week, c.city, c.pilot_capture,
       count(DISTINCT c.seller_id)::bigint AS sellers,
       COALESCE(sum(l.listings), 0)::bigint AS listings,
       COALESCE(sum(g.gmv_cents), 0)::bigint AS gmv_cents,
       COALESCE(sum(m.commission_cents), 0)::bigint AS commission_cents
FROM cohorts c
LEFT JOIN listings l ON l.snapshot_id = c.snapshot_id AND l.seller_id = c.seller_id
LEFT JOIN gmv g ON g.snapshot_id = c.snapshot_id AND g.seller_id = c.seller_id
LEFT JOIN commission m ON m.snapshot_id = c.snapshot_id AND m.seller_id = c.seller_id
GROUP BY c.snapshot_id, c.cohort_week, c.city, c.pilot_capture;

CREATE VIEW reporting.v_settlement_reconciliation AS
WITH ledger AS (
    SELECT s.id AS snapshot_id, l.currency,
           sum(CASE WHEN l.entry_type = 'PAYOUT' THEN -l.amount_cents ELSE 0 END)::bigint AS ledger_payout_cents,
           sum(CASE WHEN l.entry_type IN ('COMMISSION', 'COMMISSION_REVERSAL') THEN -l.amount_cents ELSE 0 END)::bigint AS ledger_commission_cents
    FROM reporting.report_snapshots s
    JOIN reporting.ledger_facts l
      ON l.occurred_at <= s.as_of AND l.ingested_at <= s.ingested_through
    GROUP BY s.id, l.currency
), payouts AS (
    SELECT s.id AS snapshot_id, p.currency, sum(p.amount_cents)::bigint AS released_cents
    FROM reporting.report_snapshots s
    JOIN reporting.payout_line_facts p
      ON p.released_at IS NOT NULL AND p.released_at <= s.as_of AND p.ingested_at <= s.ingested_through
    WHERE p.status = 'RELEASED'
    GROUP BY s.id, p.currency
), commission AS (
    SELECT s.id AS snapshot_id, c.currency, sum(c.amount_cents)::bigint AS commission_net_cents
    FROM reporting.report_snapshots s
    JOIN reporting.commission_facts c
      ON c.occurred_at <= s.as_of AND c.ingested_at <= s.ingested_through
    GROUP BY s.id, c.currency
)
SELECT COALESCE(l.snapshot_id, p.snapshot_id, c.snapshot_id) AS snapshot_id,
       COALESCE(l.currency, p.currency, c.currency) AS currency,
       COALESCE(l.ledger_payout_cents, 0) AS ledger_payout_cents,
       COALESCE(p.released_cents, 0) AS released_cents,
       COALESCE(p.released_cents, 0) - COALESCE(l.ledger_payout_cents, 0) AS payout_delta_cents,
       COALESCE(c.commission_net_cents, 0) AS commission_net_cents,
       COALESCE(l.ledger_commission_cents, 0) AS ledger_commission_cents,
       COALESCE(c.commission_net_cents, 0) - COALESCE(l.ledger_commission_cents, 0) AS commission_delta_cents
FROM ledger l
FULL OUTER JOIN payouts p ON p.snapshot_id = l.snapshot_id AND p.currency = l.currency
FULL OUTER JOIN commission c ON c.snapshot_id = COALESCE(l.snapshot_id, p.snapshot_id)
    AND c.currency = COALESCE(l.currency, p.currency);

-- ==========================================================================
-- Grants: read models are read, projections are appended
-- ==========================================================================
-- nastech_app may not UPDATE or DELETE evidence, and has no DDL right. The
-- mutable lifecycle tables get UPDATE because their state advances; nothing in
-- this schema gets DELETE, because a projection row that disappears is a report
-- that cannot be reproduced.

GRANT USAGE ON SCHEMA reporting TO nastech_app, nastech_owner;

GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO nastech_app;

GRANT INSERT ON
    reporting.projected_events,
    reporting.projection_state,
    reporting.search_facts,
    reporting.commission_facts,
    reporting.ledger_facts,
    reporting.payout_line_facts,
    reporting.inspection_facts,
    reporting.report_snapshots,
    reporting.report_runs
TO nastech_app;

GRANT INSERT ON
    reporting.seller_cohorts,
    reporting.listing_facts,
    reporting.order_facts,
    reporting.dispute_facts,
    reporting.capture_facts
TO nastech_app;

GRANT UPDATE ON
    reporting.projection_state,
    reporting.listing_facts,
    reporting.order_facts,
    reporting.dispute_facts,
    reporting.capture_facts
TO nastech_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA reporting TO nastech_owner;

ALTER DEFAULT PRIVILEGES IN SCHEMA reporting GRANT SELECT ON TABLES TO nastech_app;

COMMIT;
