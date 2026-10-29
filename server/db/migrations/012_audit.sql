-- NasTech Market — audit log, PostgreSQL DDL (migration 012)
--
-- Owns schema `audit`. Written against src/Audit/Schema.php; the parity and
-- row-semantics tests are tests/Audit/AuditDdlTest.php, using
-- tests/Support/DdlRowChecks.php. Like every migration in this tree this file has
-- NOT been run: there is no PostgreSQL and no PDO driver here.
-- `psql -v ON_ERROR_STOP=1` against a real cluster remains a deploy gate.
--
-- WHAT THIS TABLE ANSWERS
-- Who acted (actor_kind, actor_id, actor_role), what they did (action), to which
-- row (target_type, target_id), why (reason), when (occurred_at) and what changed
-- (before_state, after_state, diff_bytes). A staff action also names the
-- capability it used, and an impersonated action names the account it acted as,
-- so a support session is reconstructed from rows rather than from a narrative.
--
-- APPEND-ONLY, IN FOUR LAYERS
-- Schema::APPEND_ONLY_TABLES, InMemoryStore, the BEFORE UPDATE OR DELETE trigger
-- below, and the absence of UPDATE/DELETE grants even for the owner role. There
-- is no reversal row: an audit entry records what happened. A correction is a new
-- entry that says so.
--
-- SECRETS
-- The PHP write port (src/Audit/SecretGuard.php) refuses a before/after document
-- whose key is on the deny-list or whose value is shaped like a PAN or a token.
-- The guard is deliberately not duplicated as a SQL CHECK: PostgreSQL would have
-- to parse JSON key names the application already controls, and a false positive
-- at commit time would refuse the action rather than redact the field. The
-- boundary that matters is the one code writes through, and it is tested.
--
-- NO PL/pgSQL BODY except the shared trigger function from 001. No ALTER TRIGGER
-- ... OWNER TO: a trigger has no owner of its own, and PostgreSQL has no such
-- statement.

BEGIN;

CREATE SCHEMA audit;

COMMENT ON SCHEMA audit IS
    'Append-only evidence of staff actions, impersonation and money mutations. No outbound edges: rows arrive through the SharedKernel AuditSink.';

-- ==========================================================================
-- audit.audit_log
-- ==========================================================================

CREATE TABLE audit.audit_log (
    id                      text PRIMARY KEY,
    -- The instant the action was recorded. Supplied by the module clock inside the
    -- action's transaction, never by the caller and never defaulted to now().
    occurred_at             timestamptz NOT NULL,
    -- A lower-case dotted verb, e.g. sanction.apply or payout.release. The same
    -- regex as SharedKernel AuditRecord, so a bad action is refused in PHP and
    -- cannot be inserted around it.
    action                  text NOT NULL,
    target_type             text NOT NULL,
    target_id               text NOT NULL,
    -- buyer | seller | staff | system. The DDL enumerates the same four values as
    -- ActorKind; a fifth kind is a change to the module, not a free-text value.
    actor_kind              text NOT NULL,
    actor_id                text NOT NULL,
    actor_role              text NOT NULL,
    -- Nullable for an unauthenticated/system action and for a buyer or seller who
    -- acted without a session id. Never a token: the value is the session row id.
    session_id              text,
    -- Required for every staff action; NULL for buyer, seller and system actions.
    capability              text,
    -- The data subject of the action. For a staff action under impersonation this
    -- is the account being acted as, and is copied to impersonated_account_id.
    subject_id              text,
    -- Non-null only when a staff member acted through an impersonated session.
    -- Named separately from target_id because the row acted on and the person
    -- acted as are different questions.
    impersonated_account_id text,
    reason                  text,
    -- The request that caused the action. Correlation across modules; not a
    -- tracing id that changes on retry.
    request_id              text NOT NULL,
    -- Bounded JSON documents, not free text. A diff of a paragraph is a paragraph;
    -- a caller that needs to record a larger document records its id and digest.
    before_state            jsonb,
    after_state             jsonb,
    -- Byte length of the larger document, computed by the writer. It exists so the
    -- DDL can refuse an oversized diff even when PHP is bypassed, without calling
    -- length() on a jsonb document in every row check.
    diff_bytes              integer NOT NULL DEFAULT 0,

    CONSTRAINT audit_action_is_dotted_lowercase CHECK (action ~ '^[a-z][a-z0-9_.]{2,63}$'),
    CONSTRAINT audit_target_is_named CHECK (
        length(btrim(target_type)) > 0 AND length(btrim(target_id)) > 0
    ),
    CONSTRAINT audit_actor_kind_is_known CHECK (
        actor_kind IN ('buyer', 'seller', 'staff', 'system')
    ),
    CONSTRAINT audit_actor_is_named CHECK (
        length(btrim(actor_id)) > 0 AND length(btrim(actor_role)) > 0
    ),
    CONSTRAINT audit_actor_role_is_lowercase CHECK (actor_role ~ '^[a-z][a-z0-9_]{1,31}$'),
    CONSTRAINT audit_request_is_named CHECK (length(btrim(request_id)) > 0),
    CONSTRAINT audit_staff_names_capability CHECK (
        actor_kind <> 'staff'
        OR (capability IS NOT NULL AND length(btrim(capability)) > 0)
    ),
    CONSTRAINT audit_capability_is_dotted CHECK (
        capability IS NULL OR capability ~ '^[a-z][a-z0-9_.]{2,63}$'
    ),
    CONSTRAINT audit_impersonation_is_staff_only CHECK (
        impersonated_account_id IS NULL OR actor_kind = 'staff'
    ),
    CONSTRAINT audit_impersonation_names_a_different_target CHECK (
        impersonated_account_id IS NULL OR impersonated_account_id <> actor_id
    ),
    CONSTRAINT audit_impersonation_names_the_subject CHECK (
        impersonated_account_id IS NULL
        OR (subject_id IS NOT NULL AND impersonated_account_id = subject_id)
    ),
    CONSTRAINT audit_diff_is_bounded CHECK (diff_bytes >= 0 AND diff_bytes <= 8192),
    CONSTRAINT audit_diff_is_a_json_document CHECK (
        (before_state IS NULL OR jsonb_typeof(before_state) IN ('object', 'array'))
        AND (after_state IS NULL OR jsonb_typeof(after_state) IN ('object', 'array'))
    ),
    CONSTRAINT audit_reason_is_bounded CHECK (reason IS NULL OR length(reason) <= 2000)
);

COMMENT ON TABLE audit.audit_log IS
    'Append-only. A row cannot be updated or deleted by any role; a correction is a new row. The actor kind, capability and impersonated account are not optional context, they are the columns an investigation reads first.';

COMMENT ON COLUMN audit.audit_log.diff_bytes IS
    'Byte length of the larger of before_state/after_state as written. Bounded at 8192 by audit_diff_is_bounded; larger payloads are recorded by id and digest.';
COMMENT ON COLUMN audit.audit_log.impersonated_account_id IS
    'The account a staff member acted as. Equal to subject_id when present, different from actor_id always.';

-- The three access paths the audit console actually uses: one row's history, one
-- actor's actions, and everything that happened in a request.
CREATE INDEX audit_log_by_target ON audit.audit_log (target_type, target_id, occurred_at DESC);
CREATE INDEX audit_log_by_actor ON audit.audit_log (actor_id, occurred_at DESC);
CREATE INDEX audit_log_by_request ON audit.audit_log (request_id);
CREATE INDEX audit_log_by_occurrence ON audit.audit_log (occurred_at DESC);
CREATE INDEX audit_log_by_subject ON audit.audit_log (subject_id) WHERE subject_id IS NOT NULL;

-- Append-only. The function lives in 001 and is owned by nastech_owner through
-- 002; reusing it keeps one definition of "evidence rows are answered, not edited".
CREATE TRIGGER audit_log_append_only
    BEFORE UPDATE OR DELETE ON audit.audit_log
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

COMMENT ON TRIGGER audit_log_append_only ON audit.audit_log IS
    'Refuses UPDATE and DELETE from any session, including a superuser. The grant lists below remove the privilege before this trigger is reached.';

-- ==========================================================================
-- Grants (002's shape): append and read, never alter, never delete
-- ==========================================================================

GRANT USAGE ON SCHEMA audit TO nastech_app, nastech_owner;

-- The application appends and reads. There is deliberately no UPDATE and no
-- DELETE: the trigger is the backstop for a session that is not this role.
GRANT SELECT, INSERT ON audit.audit_log TO nastech_app;

-- The owner reads for reporting and appends through the same path. It cannot
-- rewrite evidence either, because there is no correction path that needs one.
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO nastech_owner;
GRANT INSERT ON audit.audit_log TO nastech_owner;

ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT SELECT ON TABLES TO nastech_app;

COMMIT;
