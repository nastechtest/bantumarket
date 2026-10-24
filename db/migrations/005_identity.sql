-- NasTech Market — identity, PostgreSQL DDL (migration 005)
--
-- Owns schema `identity`. Written against src/Identity/Schema.php; the parity
-- and row-semantics tests are tests/Identity/IdentityDdlTest.php, using
-- tests/Support/DdlRowChecks.php. Like 001 and 002 this file has NOT been run:
-- this environment has no PostgreSQL and no PDO driver. `psql -v
-- ON_ERROR_STOP=1` against a real cluster remains a deploy gate.
--
-- Identity decides no business rule about selling. It answers one question:
-- who is asking, and with which proof. Tier grants are stored, never computed
-- (the grant record carries who decided and when). Vocabulary: the only legal
-- use of the word "verified" in this schema is contact_channels.verified_at —
-- a channel was proven. It is never a statement about a person, a tier or an
-- item (spec §13.2), and tests/Identity/VocabularyScanTest.php enforces that
-- over this file and every PHP file in src/Identity.
--
-- E.164: phones are stored as +27 country code plus 9 digits, normalised in
-- PhoneNumber before anything reaches here. The CHECK refuses anything else
-- (including bare 082... local forms) so a migration script cannot smuggle an
-- unnormalised number in and split one person across two accounts.

BEGIN;

CREATE SCHEMA identity;

COMMENT ON SCHEMA identity IS
    'Accounts, credentials, sessions, contact channels, address book, POPIA erasure. No outbound edges: identity names no other module.';

-- ==========================================================================
-- identity.accounts
-- ==========================================================================

CREATE TABLE identity.accounts (
    id                text PRIMARY KEY,
    -- E.164 with the +27 country code, or the anonymised digest an erasure
    -- leaves behind. The alternation is the point: an erased row keeps its
    -- shape (unique, non-null, non-plaintext) so the ledger join below and
    -- every foreign-side reference to this id keeps working.
    phone_e164        text NOT NULL,
    -- Nullable by decision: erasure NULLs it (POPIA s.24), and an account
    -- provisioned phone-first has no display name until the subject supplies
    -- one. NULL here means "nothing to show", never "unknown subject".
    display_name      text,
    -- staff/buyer/seller is a role on one table, not three tables: the same
    -- person can hold several over time, and the capability strings in
    -- Capability.php are what authorise, not the role name.
    role              text NOT NULL DEFAULT 'buyer',
    status            text NOT NULL DEFAULT 'ACTIVE',
    -- The tier grant. Identity stores decisions made elsewhere (Safety /
    -- Capture); a tier with no grantor and no time is a tier Identity made up,
    -- which is the one thing the module-graph ban on outbound edges forbids.
    tier              text,
    tier_granted_by   text,
    -- Nullable only because tier is nullable: a granted tier always has a
    -- time, enforced by tier_grant_is_a_record_not_a_guess below.
    tier_granted_at   timestamptz,
    -- The password-set flag, deliberately distinct from the channel-proven
    -- flag on contact_channels: "this subject chose a secret" and "this number
    -- was proven to receive SMS" are two different proofs with two different
    -- failure modes.
    password_set_at   timestamptz,
    -- Optimistic CAS, same shape as orders.orders: the version trigger from
    -- 001 is table-agnostic (it only compares NEW/OLD.version), so reusing it
    -- here is one copy of the rule rather than a drifting second one.
    version           integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at        timestamptz NOT NULL DEFAULT now(),
    -- Set exactly once, by EraseSubject. NULL = not erased (unknown is not a
    -- legal state: the column is only ever written forward).
    erased_at         timestamptz,

    CONSTRAINT account_role_is_known CHECK (role IN ('buyer', 'seller', 'staff')),
    CONSTRAINT account_status_is_known CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ERASED')),
    -- Transcribed from api-contracts VerificationTier — the five wire values.
    -- Nothing in Identity may invent a sixth or compute one from signals.
    CONSTRAINT tier_value_is_from_the_contract CHECK (tier IS NULL OR tier IN ('T1', 'T2', 'T3', 'T4', 'T5')),
    CONSTRAINT tier_grant_is_a_record_not_a_guess CHECK (
        tier IS NULL OR (tier_granted_by IS NOT NULL AND tier_granted_at IS NOT NULL)
    ),
    -- Either a real SA mobile in E.164 (+27, then a nonzero digit, then eight)
    -- or the anonymised digest an erasure leaves. A plaintext local form
    -- (0 82 ...) or a foreign number fails here even if the PHP was changed to
    -- accept it, because the launch is South Africa only.
    CONSTRAINT phone_is_e164_or_anonymised CHECK (
        phone_e164 ~ '^\+27[1-9]\d{8}$' OR phone_e164 ~ '^erased_[0-9a-f]{64}$'
    )
);

-- One account per number. Erasure replaces the number with a keyed digest, so
-- the unique index keeps meaning (two erased accounts cannot collide, and a
-- re-provisioned person reappearing under the same real number is caught).
CREATE UNIQUE INDEX accounts_phone_key ON identity.accounts (phone_e164);
CREATE INDEX accounts_by_role_and_status ON identity.accounts (role, status);

CREATE TRIGGER accounts_version_monotonic
    BEFORE UPDATE ON identity.accounts
    FOR EACH ROW EXECUTE FUNCTION shared.assert_order_version_monotonic();

COMMENT ON COLUMN identity.accounts.erased_at IS
    'The anonymisation completed at this instant. The row is never deleted: orders, ledger entries and impersonation logs reference this id, and POPIA erasure anonymises the subject while preserving the ledger-linked facts the law (ECT s.15, FIC) requires.';

-- ==========================================================================
-- identity.credentials
-- ==========================================================================

CREATE TABLE identity.credentials (
    id               text PRIMARY KEY,
    account_id       text NOT NULL,
    -- argon2id is the production scheme; bcrypt is the documented fallback for
    -- a PHP built without Argon2 (see PasswordHasher.php), and 'erased' marks a
    -- digest destroyed by rehashing random bytes. The tag travels with the row
    -- so a later rebuild of PHP that gains argon2id can still verify pre-existing
    -- bcrypt digests instead of locking those subjects out.
    algo             text NOT NULL,
    password_hash    text NOT NULL,
    -- The per-account verify cost ladder: every failed check steepens the
    -- ladder for the next one, so a targeted guesser pays escalating work
    -- against this account while the digest's own embedded params stay valid.
    ladder_step      integer NOT NULL DEFAULT 0,
    failed_attempts  integer NOT NULL DEFAULT 0,
    -- NULL = never locked. The counter locks at eight rather than leaking
    -- which of "wrong password" / "locked" / "no such account" happened.
    locked_until     timestamptz,
    updated_at       timestamptz NOT NULL,

    CONSTRAINT credential_algo_is_known CHECK (algo IN ('argon2id', 'bcrypt', 'erased')),
    -- Eight, from Credential::MAX_FAILED_ATTEMPTS. Past this the database
    -- refuses the write itself: an attacker who somehow drives the counter
    -- around the PHP still cannot get a ninth attempt out of storage.
    CONSTRAINT attempts_lock_out_at_eight CHECK (failed_attempts <= 8),
    -- The ladder is bounded; an unbounded ladder is a self-inflicted
    -- denial-of-service against the account's own owner.
    CONSTRAINT ladder_is_bounded CHECK (ladder_step >= 0 AND ladder_step <= 4),
    -- A password hash is never a short value or a plaintext: the shortest
    -- legal digest here (bcrypt) is 60 chars; 32 is the erased sha256.
    CONSTRAINT credential_hash_is_never_short CHECK (length(password_hash) >= 32)
);

CREATE UNIQUE INDEX credentials_one_per_account ON identity.credentials (account_id);

-- ==========================================================================
-- identity.otp_challenges
-- ==========================================================================

CREATE TABLE identity.otp_challenges (
    id                text PRIMARY KEY,
    account_id        text NOT NULL,
    -- Redeeming a password-reset code as a login code is stopped by scope,
    -- not by luck: the scope is stored with the challenge and the redeeming
    -- command names the scope it expects.
    scope             text NOT NULL,
    -- The contact channel a channel.proven challenge points at; NULL for the
    -- other scopes (unknown is not legal for them either — the domain refuses
    -- a proven challenge without a channel).
    channel_id        text,
    -- HMAC-SHA256 of "<id>.<code>" keyed with the OTP pepper, salted per
    -- challenge id so two challenges issued the same code do not produce a
    -- comparable pair of rows. The code itself is never stored anywhere.
    digest            text NOT NULL,
    -- sha256 of the bearer claim key, NULL once consumed: Postgres allows
    -- many NULLs in a unique index, which is exactly one-live-challenge
    -- semantics. The plaintext claim key exists only in the dispatch returned
    -- to the caller once.
    active_claim_key  text,
    attempts          integer NOT NULL DEFAULT 0,
    issued_at         timestamptz NOT NULL,
    expires_at        timestamptz NOT NULL,
    -- NULL = still pending. Consumed challenges are kept: a support or dispute
    -- conversation needs to know a code was redeemed, when, and against which
    -- scope.
    consumed_at       timestamptz,

    CONSTRAINT otp_scope_is_known CHECK (scope IN ('login', 'password.reset', 'channel.proven')),
    CONSTRAINT otp_digest_is_a_hash CHECK (digest ~ '^[0-9a-f]{64}$'),
    -- Five, from OtpChallenge::MAX_ATTEMPTS. A locked challenge answers exactly
    -- like a wrong code, so the counter cannot be used to probe which
    -- challenge ids are real.
    CONSTRAINT otp_attempts_lock_out_at_five CHECK (attempts <= 5),
    CONSTRAINT otp_pending_needs_claim_key CHECK (
        consumed_at IS NOT NULL OR active_claim_key IS NOT NULL
    ),
    CHECK (expires_at > issued_at)
);

CREATE UNIQUE INDEX otp_claim_key_live_once ON identity.otp_challenges (active_claim_key);

-- ==========================================================================
-- identity.sessions
-- ==========================================================================

CREATE TABLE identity.sessions (
    id               text PRIMARY KEY,
    account_id       text NOT NULL,
    -- The bearer token is 256 bits of CSPRNG, opaque, shown once. This column
    -- is its sha256: a high-entropy secret is stored as a fast one-way digest
    -- (argon2 is for low-entropy secrets like the PIN or the password; hashing
    -- a 256-bit random with argon2 buys nothing and slows every authenticate).
    token_hash       text NOT NULL,
    -- Nullable by decision: erasure NULLs it (device naming is personal data),
    -- and a CLI/system session has no device. NULL never means "unknown
    -- session" — id and token_hash do that job.
    device_label     text,
    -- NULL for in-process/system sessions. When present it is keyed-hashed, so
    -- the anti-abuse signal exists without raw IP PII in the table.
    remote_ip_hash   text,
    issued_at        timestamptz NOT NULL,
    expires_at       timestamptz NOT NULL,
    -- Throttled write-once-per-minute touch. NULL = never used (unknown is not
    -- a legal reading: the domain treats NULL as "never seen").
    last_seen_at     timestamptz,
    revoked_at       timestamptz,
    -- NULL unless revoked. The reason strings are operator-facing, not
    -- attacker-facing: sign-out, password-reset, role-change and erasure all
    -- revoke, and the subject-facing response is identical for every one.
    revoke_reason    text,
    -- NULL for an ordinary session. When set, this session acts AS account_id
    -- ON BEHALF OF impersonated_by, bounded to Impersonation::MAX_WINDOW and
    -- written to identity.impersonation_log as its own audit record.
    impersonated_by  text,
    -- Nullable: required on impersonated sessions (see the named CHECK), never
    -- meaningful on an ordinary one.
    purpose          text,

    CONSTRAINT session_token_is_a_digest CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT session_ip_is_a_hash CHECK (remote_ip_hash IS NULL OR remote_ip_hash ~ '^[0-9a-f]{64}$'),
    -- An impersonation session without a stated purpose is the exact audit
    -- failure this table exists to make impossible.
    CONSTRAINT impersonation_states_its_purpose CHECK (
        impersonated_by IS NULL OR length(btrim(purpose)) > 0
    ),
    CHECK (expires_at > issued_at)
);

CREATE UNIQUE INDEX sessions_token_used_once ON identity.sessions (token_hash);
CREATE INDEX sessions_by_account ON identity.sessions (account_id, issued_at DESC);

COMMENT ON TABLE identity.sessions IS
    'Rotation is a revoke-then-reissue, never an in-place edit of a live token: password reset and role/tier change revoke every session for the account, so a stolen token dies with them (the stolen-token test lives in tests/Identity/SessionSecurityTest.php).';

-- ==========================================================================
-- identity.contact_channels
-- ==========================================================================

CREATE TABLE identity.contact_channels (
    id                    text PRIMARY KEY,
    account_id            text NOT NULL,
    type                  text NOT NULL,
    -- E.164 for phone (same CHECK shape as accounts.phone_e164), lowercase
    -- text for email, token for push. Erasure hashes it, same alternation.
    target                text NOT NULL,
    -- The ONLY sanctioned use of the word "verified" in this schema (spec
    -- §13.2): this channel was proven — an OTP code sent to it was redeemed.
    -- It says nothing about the person, their tier, or any item. NULL = never
    -- proven, which is the normal starting state, not an unknown.
    verified_at           timestamptz,
    -- NULL = no answer given yet (or erased); true = consented; false =
    -- refused. Three states are load-bearing: POPIA treats "never asked" and
    -- "asked and refused" differently, and a boolean cannot hold that.
    consent_marketing     boolean,
    -- Transactional consent starts NULL rather than true: the channel itself
    -- must be proven before any message, even an order notice, is sent to it.
    consent_transactional boolean,
    created_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT channel_type_is_known CHECK (type IN ('phone', 'email', 'push')),
    CONSTRAINT phone_channel_is_e164_or_anonymised CHECK (
        type <> 'phone' OR target ~ '^\+27[1-9]\d{8}$' OR target ~ '^erased_[0-9a-f]{64}$'
    )
);

-- One subject may not claim another's number or address as their own channel;
-- after erasure the digests differ per account, so this stays a meaningful
-- uniqueness rather than a collision trap.
CREATE UNIQUE INDEX channel_target_claimed_once ON identity.contact_channels (type, target);

-- ==========================================================================
-- identity.address_book
-- ==========================================================================

CREATE TABLE identity.address_book (
    id                text PRIMARY KEY,
    account_id        text NOT NULL,
    -- Every personal column is nullable on purpose: erasure NULLs them in
    -- place (they have no ledger link of their own), and the row survives so
    -- the fact that an address existed for this account at created_at stays
    -- auditable against ECT s.15 order records.
    label             text,
    recipient_name    text,
    line1             text,
    line2             text,
    locality          text,
    province_code     text,
    postal_code       text,
    is_default        boolean NOT NULL DEFAULT false,
    -- account_id while default, NULL otherwise: same one-live-row trick as
    -- otp_challenges.active_claim_key, so "one default per account" is an
    -- index, not a convention.
    default_claim_key text,
    created_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT address_recipient_is_present_when_named CHECK (
        recipient_name IS NULL OR length(btrim(recipient_name)) > 0
    ),
    -- South African postal codes are four digits, first nonzero. NULL = not
    -- supplied (or erased), which is legal: the address may be used for
    -- delivery estimates without one.
    CONSTRAINT postal_code_is_four_digits CHECK (
        postal_code IS NULL OR postal_code ~ '^[1-9]\d{3}$'
    ),
    CONSTRAINT province_code_is_two_letters CHECK (
        province_code IS NULL OR province_code ~ '^[A-Z]{2}$'
    )
);

CREATE UNIQUE INDEX address_one_default_per_account ON identity.address_book (default_claim_key);

-- ==========================================================================
-- identity.impersonation_log — append-only, separately audited
-- ==========================================================================
-- Impersonation sessions are bounded and revocable, but the log is what makes
-- the bound auditable after the fact. It is append-only with a two-row shape
-- (START, then a second END row pointing at it) because an UPDATE of the start
-- row's ended_at is precisely the edit a guilty actor would make.

CREATE TABLE identity.impersonation_log (
    id                text PRIMARY KEY,
    kind              text NOT NULL,
    actor_account_id  text NOT NULL,
    target_account_id text NOT NULL,
    session_id        text NOT NULL,
    -- NULL on START, the START row's id on END: the pair is checkable without
    -- trusting any application code that writes it.
    start_log_id      text,
    purpose           text NOT NULL,
    recorded_at       timestamptz NOT NULL,

    CONSTRAINT impersonation_kind_is_known CHECK (kind IN ('START', 'END')),
    -- "Investigating" is not a purpose. This column is the sentence a POPIA
    -- complaint is answered with, so it must not be blankable.
    CONSTRAINT impersonation_reason_is_mandatory CHECK (length(btrim(purpose)) > 0),
    CONSTRAINT impersonation_end_references_start CHECK (kind <> 'END' OR start_log_id IS NOT NULL),
    CONSTRAINT impersonation_start_has_no_parent CHECK (kind <> 'START' OR start_log_id IS NULL)
);

CREATE INDEX impersonation_by_actor ON identity.impersonation_log (actor_account_id, recorded_at);
CREATE INDEX impersonation_by_target ON identity.impersonation_log (target_account_id, recorded_at);

CREATE TRIGGER impersonation_log_append_only
    BEFORE UPDATE OR DELETE ON identity.impersonation_log
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- identity.erasure_records — append-only
-- ==========================================================================

CREATE TABLE identity.erasure_records (
    id               text PRIMARY KEY,
    account_id       text NOT NULL,
    actor_account_id text NOT NULL,
    reason           text NOT NULL,
    erased_at        timestamptz NOT NULL,
    -- The column-by-column outcome, as data: { "accounts.display_name":
    -- "null", "accounts.phone_e164": "hash", "accounts.id": "kept", ... }.
    -- A POPIA s.24 assistance request is answered by reading this row, not by
    -- trusting a README.
    column_changes   jsonb NOT NULL CHECK (jsonb_typeof(column_changes) = 'object'),

    CONSTRAINT erasure_reason_is_mandatory CHECK (length(btrim(reason)) > 0)
);

CREATE TRIGGER erasure_records_append_only
    BEFORE UPDATE OR DELETE ON identity.erasure_records
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

COMMIT;

-- ==========================================================================
-- Grants — least privilege, following 002's shape (outside the transaction,
-- same as 002, because the trigger functions above must exist first).
-- ==========================================================================
-- The app role never gets DELETE on identity: rows anonymise in place, they do
-- not vanish. Anything that could mass-delete accounts (and with them the
-- join targets of the ledger) is deliberately a role the application does not
-- hold.

GRANT USAGE ON SCHEMA identity TO nastech_app;
GRANT USAGE ON SCHEMA identity TO nastech_owner;

GRANT SELECT, INSERT, UPDATE ON
    identity.accounts,
    identity.credentials,
    identity.otp_challenges,
    identity.sessions,
    identity.contact_channels,
    identity.address_book
TO nastech_app;

-- Evidence: read and append, never edit, for the application role as well as
-- by trigger — the two layers fail differently and both are required.
GRANT SELECT, INSERT ON
    identity.impersonation_log,
    identity.erasure_records
TO nastech_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    identity.accounts,
    identity.credentials,
    identity.otp_challenges,
    identity.sessions,
    identity.contact_channels,
    identity.address_book
TO nastech_owner;

-- ==========================================================================
-- Deliberately NOT in this file
-- ==========================================================================
-- * Foreign keys from identity.accounts to anything, or from anything to
--   identity: cross-module references are bare ids by the same argument as
--   001's ledger (schemas are module boundaries; an FK welds them together).
-- * Raw IP storage. remote_ip_hash is keyed; the raw address lives in the
--   access log with its own retention, not here.
-- * The impersonation 30-minute bound as an interval CHECK: the row evaluator
--   in tests/Support/DdlRowChecks.php models a deliberately narrow grammar and
-- * INTERVAL arithmetic is outside it; the bound is domain-enforced and tested
--   instead of written where nothing in this repository could check it.
-- * TOTP/hardware-credential columns. The contract surface is OTP digests and
--   passwords today; a passkey table is its own migration, not a bolt-on here.
