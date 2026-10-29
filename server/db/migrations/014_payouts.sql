-- NasTech Market — payouts, PostgreSQL DDL (migration 014)
--
-- Owns schema `payouts`. Applies after 013_reporting.sql; it depends on the
-- `shared` domains created by 001_money_path.sql (shared.rand_currency,
-- shared.positive_cents) and on the roles created by 002_roles_and_grants.sql.
--
-- WHAT THIS SCHEMA IS
-- A payout batch is an instruction, not a second ledger. The money is the
-- PAYOUT rows in settlements.ledger_entries, written by Payouts through
-- Settlements' Ledger inside the same transaction that moves a batch to
-- RELEASED. A reversal is a contra ledger row with reversal_of pointing at the
-- original; nothing here deletes or rewrites evidence.
--
-- WHAT THE DDL CAN HOLD, IT HOLDS
-- Maker-checker (approved_by <> prepared_by), a positive total, a positive
-- line, the known batch statuses and bank brands, four digits and only four,
-- and the lifecycle implications (released needs an approver and a time; failed
-- needs a release and a reason; a reversal needs a ledger row to reverse).
-- The one rule it cannot express as a CHECK is "the sum of the lines equals
-- the header total" — that is enforced by PayoutBatch's constructor and by the
-- fact that both are written in one transaction.
--
-- MASKING
-- There is no column for an account number, an ID number or a card number.
-- bank_last_four is a four-digit CHECK and bank_brand is a closed vocabulary;
-- the unmasked value never reaches PostgreSQL because BankDestination refuses
-- it before the row is built.
--
-- STATE: not executed against a real server. There is no PostgreSQL in this
-- environment; `psql -v ON_ERROR_STOP=1` remains a deploy gate, as for 001.
--
-- Idempotence: none. This migration runs once, inside a transaction.

BEGIN;

CREATE SCHEMA payouts;

COMMENT ON SCHEMA payouts IS
    'Payout instructions: a maker-checker batch header and masked bank destinations. The money itself is settlements.ledger_entries.';

-- ==========================================================================
-- payouts.payout_batches — the instruction
-- ==========================================================================

CREATE TABLE payouts.payout_batches (
    id              text PRIMARY KEY,
    -- The retry key. Unique below: a retry is the same batch, not a second one.
    payout_key      text NOT NULL,
    -- Digest of the requested lines. Same key + same digest is a retry; the same
    -- key with different money is refused instead of returning the old batch.
    request_digest  text NOT NULL,
    status          text NOT NULL DEFAULT 'PREPARED',
    prepared_by     text NOT NULL,
    -- Null until a second staff member approves. The CHECK below is what makes
    -- "the maker cannot approve" true of the storage, not only of the command.
    approved_by     text,
    total_cents     shared.positive_cents NOT NULL,
    currency        shared.rand_currency NOT NULL DEFAULT 'ZAR',
    prepared_at     timestamptz NOT NULL DEFAULT now(),
    released_at     timestamptz,
    failed_at       timestamptz,
    failure_reason  text,
    -- Optimistic CAS, the same shape as orders.orders. The repository compares
    -- this; the CHECK keeps an invented zero from looking loadable.
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),

    CONSTRAINT batch_key_is_not_blank CHECK (length(btrim(payout_key)) > 0),
    CONSTRAINT preparer_is_named CHECK (length(btrim(prepared_by)) > 0),
    CONSTRAINT batch_status_is_known CHECK (status IN ('PREPARED', 'RELEASED', 'FAILED')),
    CONSTRAINT batch_total_is_positive CHECK (total_cents > 0),

    -- Maker-checker, as a row rule. Named because it is a decision that gets
    -- quoted in an audit, not column hygiene.
    CONSTRAINT approver_is_not_the_maker CHECK (approved_by IS NULL OR approved_by <> prepared_by),

    -- Approval and release are one transition: an "approved" batch with no
    -- ledger row would be a second source of truth.
    CONSTRAINT released_batch_has_an_approver CHECK (
        status <> 'RELEASED' OR (approved_by IS NOT NULL AND released_at IS NOT NULL)
    ),

    -- A failure is a reversal of a released instruction, and it says why.
    CONSTRAINT failed_batch_was_released_and_explained CHECK (
        status <> 'FAILED'
        OR (released_at IS NOT NULL AND failed_at IS NOT NULL
            AND failure_reason IS NOT NULL AND length(btrim(failure_reason)) > 0)
    ),

    -- Idempotency, by index rather than by check-then-write.
    CONSTRAINT payout_key_is_spent_once UNIQUE (payout_key)
);

COMMENT ON COLUMN payouts.payout_batches.status IS
    'PREPARED, RELEASED or FAILED. Mirrors PayoutBatch::STATUSES; PayoutsDdlTest compares the two.';
COMMENT ON COLUMN payouts.payout_batches.approved_by IS
    'The checker. approver_is_not_the_maker is the maker-checker rule stated by the database.';
COMMENT ON COLUMN payouts.payout_batches.request_digest IS
    'SHA-256 over the sorted requested lines. Distinguishes a retry from a key reused for different money.';

CREATE INDEX payout_batches_by_status ON payouts.payout_batches (status, prepared_at);

-- ==========================================================================
-- payouts.payout_lines — one seller/order per line, masked destination
-- ==========================================================================

CREATE TABLE payouts.payout_lines (
    id               text PRIMARY KEY,
    batch_id         text NOT NULL REFERENCES payouts.payout_batches (id),
    seller_id        text NOT NULL,
    -- Every line names the order whose money it pays. That is what lets a
    -- dispute block the payout and what makes the reversal point at one order.
    order_id         text NOT NULL,
    amount_cents     shared.positive_cents NOT NULL,
    currency         shared.rand_currency NOT NULL DEFAULT 'ZAR',
    -- A bank brand and the last four digits. Nothing else, ever.
    bank_brand       text NOT NULL,
    bank_last_four   text NOT NULL,
    oldest_payable_at timestamptz NOT NULL,
    -- Written on release, through Settlements' Ledger. Null while PREPARED.
    ledger_entry_id  text,
    -- Written on a failed attempt: the contra row that returned the money.
    reversal_ledger_entry_id text,

    CONSTRAINT line_amount_is_positive CHECK (amount_cents > 0),
    CONSTRAINT line_names_its_order CHECK (length(btrim(order_id)) > 0),

    -- The brand vocabulary is BankBrand, closed. A free-text brand becomes
    -- three spellings of Capitec and no way to total payouts per bank.
    CONSTRAINT masked_brand_is_known CHECK (bank_brand IN (
        'capitec', 'fnb', 'absa', 'standard_bank', 'nedbank',
        'tyme', 'discovery', 'investec', 'other'
    )),

    -- Four digits, exactly. This is the column that would otherwise become the
    -- account number "because the form sent it".
    CONSTRAINT masked_last_four_is_four_digits CHECK (bank_last_four ~ '^[0-9]{4}$'),

    -- You cannot reverse a payout that was never released: there is no row to
    -- point at and the credit would invent money.
    CONSTRAINT reversal_follows_a_ledger_row CHECK (
        reversal_ledger_entry_id IS NULL OR ledger_entry_id IS NOT NULL
    ),

    -- One order appears once per batch. A duplicated instruction line would pay
    -- the same money twice, and the index says so structurally.
    CONSTRAINT payout_line_is_unique_per_order UNIQUE (batch_id, seller_id, order_id)
);

COMMENT ON COLUMN payouts.payout_lines.bank_last_four IS
    'The only four digits stored. A full account number, ID number or card number is refused by BankDestination before a row is built, and this CHECK would refuse a longer value anyway.';
COMMENT ON COLUMN payouts.payout_lines.ledger_entry_id IS
    'The settlements.ledger_entries PAYOUT row this line produced. Written in the same transaction as the batch status.';

CREATE INDEX payout_lines_by_seller ON payouts.payout_lines (seller_id);

-- ==========================================================================
-- Grants
-- ==========================================================================
-- The application may insert an instruction and may update its lifecycle
-- columns (status, approver, ledger pointers). It may not delete: a payout
-- instruction is evidence, and the repair for a failed one is another row.

GRANT USAGE ON SCHEMA payouts TO nastech_app, nastech_owner;

GRANT SELECT, INSERT, UPDATE ON
    payouts.payout_batches,
    payouts.payout_lines
TO nastech_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA payouts TO nastech_owner;

ALTER DEFAULT PRIVILEGES IN SCHEMA payouts GRANT SELECT ON TABLES TO nastech_app;

COMMIT;

-- ==========================================================================
-- Deliberately NOT in this file
-- ==========================================================================
-- * Triggers. The platform's append-only trigger lives in 001 and applies to
--   settlements.ledger_entries; Payouts owns no append-only table, because a
--   batch header and its ledger pointers have a lifecycle. No ALTER ... OWNER
--   is needed for a trigger that does not exist.
-- * A foreign key from payout_lines.ledger_entry_id to settlements. That would
--   make two module schemas one schema; the batch and the ledger agree because
--   they commit in one transaction, not because a constraint joins them.
-- * The sum(amount_cents) = total_cents rule. A CHECK cannot aggregate other
--   rows portably; PayoutBatch's constructor refuses a header that does not
--   equal its lines, and both are written in the same transaction.
-- * Any bank detail beyond brand and four digits. Masking at the edge is not
--   enough if the unmasked value is accepted and masked later.
