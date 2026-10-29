-- NasTech Market — safety, PostgreSQL DDL (migration 008)
--
-- Owns schema `safety`. Written against src/Safety/Schema.php; the parity and
-- row-semantics tests are tests/Safety/SafetyDdlTest.php, using
-- tests/Support/DdlRowChecks.php. Like every migration in this tree this file has
-- NOT been run: there is no PostgreSQL and no PDO driver here.
-- `psql -v ON_ERROR_STOP=1` against a real cluster remains a deploy gate.
--
-- 008 is Safety's number even though 009_messaging.sql already exists. Messaging
-- was written while Safety was still a projection source; the reserved number is
-- intentional and this file applies after 004 without depending on anything those
-- migrations created except the shared trigger functions from 001.
--
-- What this schema is for, and the one rule it cannot relax: a report body is
-- stored so a reviewer can act on it, and it is never returned to the account the
-- report is about. The DDL helps twice — the body CHECKs refuse the shapes that
-- turn a narrative into an identity record, and the column list is small enough
-- that there is no second copy. The application-side retrieval rule lives in
-- SafetyService::readReport() and is tested; SQL cannot enforce "who is asking".
--
-- Sanctions are maker-checker for suspend and ban. The CHECKs below are the
-- shape: proposed has no checker, applied names a different account, and a
-- warning is the one action that is complete when issued. The evidence rows in
-- safety.sanction_decisions are append-only by trigger and by grant.

BEGIN;

CREATE SCHEMA safety;

COMMENT ON SCHEMA safety IS
    'User-to-user reports, blocks and account sanctions. The report body is stored and screened; no event and no read path returns it to the reported party. Outbound module edge: Identity (account existence and session revocation).';

-- ==========================================================================
-- safety.reports
-- ==========================================================================

CREATE TABLE safety.reports (
    id                  text PRIMARY KEY,
    reporter_id         text NOT NULL,
    -- LISTING / SELLER / BUYER / MESSAGE. The subject id is opaque: a listing,
    -- account or message id depending on this value. reported_account_id is
    -- stored separately so the body-visibility rule is answerable without a
    -- join into Listings or Messaging on every read.
    subject_type        text NOT NULL,
    subject_id          text NOT NULL,
    reported_account_id text NOT NULL,
    reason              text NOT NULL,
    -- The screened narrative. NOT NULL: a report with no words cannot be
    -- triaged, and an empty body would be indistinguishable from one that was
    -- withheld. Length and identifier-shape rules are named below.
    body                text NOT NULL,
    state               text NOT NULL DEFAULT 'OPEN',
    version             integer NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT report_reason_is_known CHECK (
        reason IN ('HARASSMENT', 'SCAM', 'COUNTERFEIT', 'PROHIBITED_ITEM', 'OFF_PLATFORM', 'PERSONAL_DATA', 'OTHER')
    ),
    CONSTRAINT report_subject_is_known CHECK (
        subject_type IN ('LISTING', 'SELLER', 'BUYER', 'MESSAGE')
    ),
    CONSTRAINT report_state_is_known CHECK (
        state IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED')
    ),
    CONSTRAINT a_report_is_not_about_its_author CHECK (reporter_id <> reported_account_id),
    CONSTRAINT a_report_names_its_subject CHECK (
        length(btrim(subject_id)) > 0
        AND length(btrim(reported_account_id)) > 0
    ),
    CONSTRAINT report_body_is_readable CHECK (
        length(btrim(body)) > 0
        AND length(body) <= 4000
    ),
    -- Defence in depth for the screen in PersonalDataScreen: a run of 13 or
    -- more digits is an SA ID or a card, with or without separators.
    CONSTRAINT report_body_has_no_identifier_number CHECK (
        body !~ '(^|[^0-9])([0-9][ -]?){13,}([^0-9]|$)'
    ),
    -- SA local and international shapes: 0821234567, 082 123 4567, +27 82 ...
    CONSTRAINT report_body_has_no_phone_number CHECK (
        body !~ '(^|[^0-9])(\+?27|0)[ -]?[0-9]{2}[ -]?[0-9]{3}[ -]?[0-9]{4}([^0-9]|$)'
    ),
    CONSTRAINT report_version_starts_positive CHECK (version >= 1)
);

COMMENT ON TABLE safety.reports IS
    'Reports against a listing, seller, buyer or message. The body is screened before insert and is returned only by SafetyService::readReport(), never to reported_account_id.';
COMMENT ON COLUMN safety.reports.body IS
    'Free text that passed PersonalDataScreen. Deliberately not echoed to the reported party, and never put on an outbox payload.';

CREATE INDEX reports_by_reporter ON safety.reports (reporter_id, created_at DESC);
CREATE INDEX reports_by_reported_account ON safety.reports (reported_account_id, created_at DESC);
CREATE INDEX reports_by_state ON safety.reports (state, created_at);

CREATE TRIGGER safety_reports_version_monotonic
    BEFORE UPDATE ON safety.reports
    FOR EACH ROW EXECUTE FUNCTION shared.assert_order_version_monotonic();

-- ==========================================================================
-- safety.blocks — one direction, unique pair
-- ==========================================================================

CREATE TABLE safety.blocks (
    id          text PRIMARY KEY,
    blocker_id  text NOT NULL,
    blocked_id  text NOT NULL,
    reason      text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT a_block_is_not_self CHECK (blocker_id <> blocked_id),
    CONSTRAINT a_block_records_a_reason CHECK (length(btrim(reason)) > 0),
    CONSTRAINT a_block_names_both_parties CHECK (
        length(btrim(blocker_id)) > 0
        AND length(btrim(blocked_id)) > 0
    )
);

COMMENT ON TABLE safety.blocks IS
    'One row per (blocker, blocked). The unique index is the idempotency: a retried block is the same block. Messaging asks Safety::mayMessage() rather than reading this table.';

CREATE UNIQUE INDEX a_pair_is_blocked_once
    ON safety.blocks (blocker_id, blocked_id);

CREATE INDEX blocks_by_blocked_account ON safety.blocks (blocked_id);

CREATE TRIGGER safety_blocks_append_only
    BEFORE UPDATE OR DELETE ON safety.blocks
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- safety.sanctions — warning / suspend / ban
-- ==========================================================================

CREATE TABLE safety.sanctions (
    id                text PRIMARY KEY,
    target_account_id text NOT NULL,
    action            text NOT NULL,
    state             text NOT NULL,
    reason            text NOT NULL,
    -- Required for all three actions: a sanction with no end cannot be
    -- reviewed, and "until Friday" versus "forever" is the ban review's question.
    expires_at        timestamptz NOT NULL,
    maker_id          text NOT NULL,
    -- Nullable while proposed and for a warning. A suspend or ban that is
    -- applied names the second actor here; decided_at says when.
    checker_id        text,
    decided_at        timestamptz,
    version           integer NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT sanction_action_is_known CHECK (action IN ('WARNING', 'SUSPEND', 'BAN')),
    CONSTRAINT sanction_state_is_known CHECK (state IN ('PROPOSED', 'APPLIED')),
    CONSTRAINT a_sanction_records_a_reason CHECK (length(btrim(reason)) > 0),
    CONSTRAINT a_sanction_names_its_target_and_maker CHECK (
        length(btrim(target_account_id)) > 0
        AND length(btrim(maker_id)) > 0
    ),
    CONSTRAINT sanction_expiry_is_after_it_was_raised CHECK (expires_at > created_at),
    CONSTRAINT a_proposed_sanction_awaits_a_second_actor CHECK (
        state <> 'PROPOSED'
        OR (checker_id IS NULL AND decided_at IS NULL)
    ),
    CONSTRAINT an_applied_sanction_says_when CHECK (
        state <> 'APPLIED'
        OR decided_at IS NOT NULL
    ),
    CONSTRAINT a_sanction_is_not_self_checked CHECK (
        checker_id IS NULL
        OR checker_id <> maker_id
    ),
    -- The maker-checker rule as a row shape: warning = one actor and complete;
    -- suspend/ban = proposed with no checker, then applied with a different one.
    CONSTRAINT a_warning_needs_one_actor_and_a_restraint_needs_two CHECK (
        (action = 'WARNING' AND state = 'APPLIED' AND checker_id IS NULL)
        OR (action <> 'WARNING' AND state = 'PROPOSED' AND checker_id IS NULL)
        OR (action <> 'WARNING' AND state = 'APPLIED' AND checker_id IS NOT NULL)
    ),
    CONSTRAINT sanction_version_starts_positive CHECK (version >= 1)
);

COMMENT ON TABLE safety.sanctions IS
    'The live sanction aggregate. A warning is APPLIED on issue; a suspend or ban is PROPOSED until a different staff account approves it. The audit of who decided, when and why is safety.sanction_decisions.';

CREATE INDEX sanctions_by_target ON safety.sanctions (target_account_id, created_at DESC);
CREATE INDEX sanctions_by_state ON safety.sanctions (state, expires_at);

CREATE TRIGGER safety_sanctions_version_monotonic
    BEFORE UPDATE ON safety.sanctions
    FOR EACH ROW EXECUTE FUNCTION shared.assert_order_version_monotonic();

-- ==========================================================================
-- safety.sanction_decisions — append-only evidence
-- ==========================================================================

CREATE TABLE safety.sanction_decisions (
    id          text PRIMARY KEY,
    sanction_id text NOT NULL,
    -- PROPOSED and APPROVED are the two-actor path; WARNING_ISSUED is the
    -- single-actor path. They are separate values so the role is not inferred
    -- from who happened to write the row.
    decision    text NOT NULL,
    actor_id    text NOT NULL,
    actor_role  text NOT NULL,
    reason      text NOT NULL,
    decided_at  timestamptz NOT NULL,

    CONSTRAINT decision_is_known CHECK (
        decision IN ('PROPOSED', 'APPROVED', 'WARNING_ISSUED')
    ),
    CONSTRAINT decision_actor_role_is_known CHECK (
        actor_role IN ('MAKER', 'CHECKER')
    ),
    CONSTRAINT a_decision_names_the_role_that_made_it CHECK (
        (decision IN ('PROPOSED', 'WARNING_ISSUED') AND actor_role = 'MAKER')
        OR (decision = 'APPROVED' AND actor_role = 'CHECKER')
    ),
    CONSTRAINT a_decision_records_a_reason CHECK (length(btrim(reason)) > 0),
    CONSTRAINT a_decision_names_its_actor CHECK (length(btrim(actor_id)) > 0)
);

COMMENT ON TABLE safety.sanction_decisions IS
    'Append-only evidence: who decided, when, why. A proposal and an approval are two rows; a warning is one WARNING_ISSUED row. UPDATE and DELETE are refused by trigger and withheld by grant.';

CREATE UNIQUE INDEX a_sanction_has_one_decision_of_each_kind
    ON safety.sanction_decisions (sanction_id, decision);

CREATE INDEX decisions_by_sanction ON safety.sanction_decisions (sanction_id, decided_at);

CREATE TRIGGER safety_sanction_decisions_append_only
    BEFORE UPDATE OR DELETE ON safety.sanction_decisions
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- Grants (002's shape): least privilege, never TRUNCATE or DDL
-- ==========================================================================

GRANT USAGE ON SCHEMA safety TO nastech_app;
GRANT USAGE ON SCHEMA safety TO nastech_owner;

-- Mutable: a report moves through triage states and an applied sanction records
-- its checker. No DELETE: a report is dismissed, never removed; a sanction
-- expires, never disappears.
GRANT SELECT, INSERT, UPDATE ON
    safety.reports,
    safety.sanctions
TO nastech_app;

-- Evidence: read and append only.
GRANT SELECT, INSERT ON
    safety.blocks,
    safety.sanction_decisions
TO nastech_app;

-- Reporting reads; it does not rewrite evidence. UPDATE is absent even for the
-- owner because there is no correction path that needs one.
GRANT SELECT ON ALL TABLES IN SCHEMA safety TO nastech_owner;

COMMIT;
