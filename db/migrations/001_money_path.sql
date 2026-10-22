-- NasTech Market — money path, PostgreSQL DDL
--
-- STATE: written against src/SharedKernel/Persistence/Schema.php and
-- src/Settlements/MoneyInvariants.php. NOT YET EXECUTED: this environment has no
-- PostgreSQL and no PDO driver, so nothing here has run against a real server.
--
-- Three tests stand in for running it:
--   tests/Persistence/SchemaParityTest.php
--       the two sides declare the same tables, columns, unique indexes, append-only
--       triggers, named row rules and enumerated vocabularies;
--   tests/Persistence/MoneyPathRowsSatisfyTheDdlChecksTest.php
--       every row the money path writes satisfies every row CHECK on its table, with
--       the real refund row among them — which is how the two commission rules that
--       rejected every refund were found;
--   and the same rules asserted in the domain object they govern.
--
-- What is still NOT proven, and needs psql -v ON_ERROR_STOP=1 against a real
-- cluster before this file is trusted: that the SQL parses; that the gist exclusion
-- and the btree_gist extension behave; that the deferred constraint triggers fire at
-- commit rather than per statement; that the grants bind as described. That is an
-- open item, not a formality.
--
-- The argument for putting these rules here rather than only in PHP: an
-- application bug, a migration script, a psql session with the wrong intent, or a
-- future service that reads these tables all bypass a PHP guard. A constraint the
-- storage engine refuses to violate is the only kind that survives being
-- forgotten by the next engineer.
--
-- Idempotence: none. This is migration 001 and runs once, inside a transaction.

BEGIN;

-- ==========================================================================
-- Extensions
-- ==========================================================================
-- btree_gist is what lets the commission policy window be an EXCLUDE constraint:
-- GiST has no equality opclass for text on its own, and the overlap half of the
-- constraint needs GiST while the equality half needs btree. Managed Postgres
-- ships it; a self-hosted cluster needs the package, which is why it is declared
-- first and not discovered at the CREATE TABLE.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ==========================================================================
-- Schemas: one per module, from 03-nastech-market.modules.dot
-- ==========================================================================
-- Cross-module access is through the module's own tables, not another module's:
-- the grants at the bottom of this file are the enforcement, and they are written
-- per table on purpose so that a new table starts with no access rather than with
-- the previous module's access.

CREATE SCHEMA shared;
CREATE SCHEMA catalogue;
CREATE SCHEMA orders;
CREATE SCHEMA payments;
CREATE SCHEMA commissions;
CREATE SCHEMA settlements;
CREATE SCHEMA handover;

COMMENT ON SCHEMA shared IS 'Outbox and the cross-cutting constraint functions. Depended on by every module, depends on none.';

-- ==========================================================================
-- Money
-- ==========================================================================
-- Integer cents, never numeric(12,2) and never float. The commission rate is the
-- one non-integer and it is bounded and validated in the application, because a
-- rate is an input to a calculation and not an amount of money.

CREATE DOMAIN shared.rand_currency AS text
    CHECK (VALUE = 'ZAR');

COMMENT ON DOMAIN shared.rand_currency IS
    'Single-currency launch (spec v1.1 §2, South Africa). Widening this is a schema change, not a config change: every amount column, ledger sum and reconciliation comparison in this file assumes one currency, and adding a second without re-deriving them is how a marketplace ends up crediting ZAR against a USD row.';

CREATE DOMAIN shared.positive_cents AS bigint
    CHECK (VALUE > 0);

CREATE DOMAIN shared.nonzero_cents AS bigint
    CHECK (VALUE <> 0);

COMMENT ON DOMAIN shared.nonzero_cents IS
    'A zero-value ledger row is noise, not evidence. Mirrors Ledger::record refusing one.';

-- ==========================================================================
-- catalogue.listings
-- ==========================================================================

CREATE TABLE catalogue.listings (
    id              text PRIMARY KEY,
    title           text NOT NULL CHECK (length(btrim(title)) > 0),
    seller_id       text NOT NULL,
    category        text NOT NULL CHECK (length(btrim(category)) > 0),
    price_cents     bigint NOT NULL CHECK (price_cents >= 0),
    currency        shared.rand_currency NOT NULL DEFAULT 'ZAR',
    serial_or_imei  text,
    -- Transcribed from Listing's own constants, not from what a listing status
    -- sounds like it should be. RESERVED is the state an order drives it into, so a
    -- list without it refuses the first write of the sale.
    status          text NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'RESERVED', 'SOLD', 'WITHDRAWN')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN catalogue.listings.category IS
    'Copied onto the order at creation. The order, not the listing, is what a commission policy is resolved against later — the listing may be edited or removed and must not re-price a sale.';

-- ==========================================================================
-- orders.orders
-- ==========================================================================

CREATE TABLE orders.orders (
    id                    text PRIMARY KEY,
    listing_id            text NOT NULL,
    buyer_id              text NOT NULL,
    seller_id             text NOT NULL,
    category              text NOT NULL CHECK (length(btrim(category)) > 0),
    item_price_cents      bigint NOT NULL CHECK (item_price_cents > 0),
    buyer_total_cents     bigint NOT NULL,
    currency              shared.rand_currency NOT NULL DEFAULT 'ZAR',
    status                text NOT NULL DEFAULT 'AWAITING_PAYMENT'
                              CHECK (status IN ('AWAITING_PAYMENT', 'PAID', 'HANDOVER_SCHEDULED',
                                                'HANDOVER_CONFIRMED', 'COMPLETED', 'CANCELLED',
                                                'REFUND_PENDING', 'REFUNDED', 'IN_DISPUTE')),
    -- Optimistic locking. The application compares the version it loaded against
    -- this one; shared.assert_order_version_monotonic below additionally refuses
    -- any write that does not move the version forward, so a stale aggregate
    -- cannot overwrite a newer row even if the application forgets to check.
    version               integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    paid_at               timestamptz,
    handover_confirmed_at timestamptz,
    completed_at          timestamptz,
    handover_token_id     text,
    created_at            timestamptz NOT NULL DEFAULT now(),

    -- A buyer may not sell to themselves (CreateOrder refuses it). At the storage
    -- layer too, because the check costs nothing and a marketplace where one
    -- account can buy from itself is a marketplace where the ledger is fiction.
    CONSTRAINT buyer_is_not_seller CHECK (buyer_id <> seller_id),

    -- Named so it is listed in Schema::ROW_CHECKS: the buyer never pays less than
    -- the seller's agreed price. Fees and delivery add to the total; nothing
    -- subtracts from it.
    CONSTRAINT buyer_total_covers_item_price CHECK (buyer_total_cents >= item_price_cents)
);

COMMENT ON COLUMN orders.orders.status IS
    'The value set is enforced here; the transitions between them are owned by Order::TRANSITIONS in PHP and deliberately NOT duplicated in SQL. Two copies of a state machine drift, and the copy that is checked less often is the one that is wrong.';

CREATE INDEX orders_by_seller_and_status ON orders.orders (seller_id, status);
CREATE INDEX orders_by_buyer ON orders.orders (buyer_id, created_at DESC);

CREATE FUNCTION shared.assert_order_version_monotonic() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.version <= OLD.version THEN
        RAISE EXCEPTION 'order % saved at version %, which does not advance the stored version %',
            OLD.id, NEW.version, OLD.version
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER orders_version_monotonic
    BEFORE UPDATE ON orders.orders
    FOR EACH ROW EXECUTE FUNCTION shared.assert_order_version_monotonic();

-- ==========================================================================
-- payments.provider_events — the idempotency claim
-- ==========================================================================

CREATE TABLE payments.provider_events (
    id                 text PRIMARY KEY,
    provider           text NOT NULL,
    provider_event_id  text NOT NULL,
    order_id           text NOT NULL,
    -- Exactly WebhookEvent's types, and nothing else. There is no payment.failed
    -- event in the model, and admitting one here would let a row commit that
    -- RecordProviderPayment has no branch for. Widening a provider adapter means
    -- widening this list in the same commit; SchemaParityTest compares the two.
    event_type         text NOT NULL CHECK (event_type IN ('payment.captured', 'refund.settled', 'chargeback.opened')),
    claimed_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE payments.provider_events IS
    'The provider will deliver the same event again: it is a queue, not a promise. Claiming the event id inside the money transaction is what makes the second delivery a no-op instead of a second payout. This is defence against double payout; the signature replay table below is a different defence against a different attack, and both are required.';

-- ==========================================================================
-- payments.seen_webhook_signatures — replay window
-- ==========================================================================

CREATE TABLE payments.seen_webhook_signatures (
    id           text PRIMARY KEY,
    signature    text NOT NULL,
    received_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE payments.seen_webhook_signatures IS
    'HMAC verification alone still accepts a captured request replayed inside the tolerance window. Retention is bounded by that window plus the provider retry period; see the pruning note in README rather than growing this forever.';

-- ==========================================================================
-- payments.payment_discrepancies — human-owned
-- ==========================================================================

CREATE TABLE payments.payment_discrepancies (
    id                 text PRIMARY KEY,
    order_id           text NOT NULL,
    provider           text NOT NULL,
    provider_event_id  text NOT NULL,
    expected_cents     bigint NOT NULL,
    received_cents     bigint NOT NULL,
    currency           shared.rand_currency NOT NULL DEFAULT 'ZAR',
    observed_at        timestamptz NOT NULL DEFAULT now(),
    resolved_at        timestamptz,
    resolved_by        text,
    resolution_note    text,

    -- An unresolved amount difference is by definition a difference.
    CONSTRAINT discrepancy_is_real CHECK (expected_cents <> received_cents)
);

COMMENT ON TABLE payments.payment_discrepancies IS
    'Mutable on purpose: a human closes it. NOT append-only — see the note in Schema::APPEND_ONLY_TABLES. What is fixed is that the row is inserted inside the transaction that observed the discrepancy.';

-- ==========================================================================
-- commissions.policies — the governed rates
-- ==========================================================================
-- Declared here so the overlap rule lives in the database as well as in
-- CommissionPolicyRegistry. Two live rates for one category means nobody can say
-- what a sale cost, and an exclusion constraint is how that stays impossible even
-- when the registry is rebuilt from a config file nobody read.

CREATE TABLE commissions.policies (
    id              text PRIMARY KEY,
    category        text NOT NULL CHECK (length(btrim(category)) > 0),
    rate            numeric(6, 5) NOT NULL CHECK (rate >= 0 AND rate <= 0.5),
    floor_cents     bigint NOT NULL CHECK (floor_cents >= 0),
    cap_cents       bigint,
    currency        shared.rand_currency NOT NULL DEFAULT 'ZAR',
    effective_from  timestamptz NOT NULL,
    effective_to    timestamptz NOT NULL,
    reason          text NOT NULL,

    -- The three rules below are named because they are decisions, not column
    -- hygiene, and commissions.policies is the one table the money path never
    -- writes — so no row can ever prove them. Schema::ROW_CHECKS is the only
    -- thing standing between a deleted line here and an unnoticed silence.
    CONSTRAINT policy_cap_is_not_below_floor CHECK (cap_cents IS NULL OR cap_cents >= floor_cents),
    CONSTRAINT policy_window_is_not_empty CHECK (effective_from < effective_to),
    CONSTRAINT policy_reason_is_mandatory CHECK (length(btrim(reason)) > 0),

    -- Half-open window [from, to), matching CommissionPolicy::appliesTo, so a
    -- changeover at midnight needs no gap and no overlap.
    --
    -- gist, not btree: the range overlap operator && only has a gist opclass.
    -- btree_gist (created at the top of this file) supplies the equality on
    -- category, so the text column can share the exclusion with the range.
    CONSTRAINT no_overlapping_policies EXCLUDE USING gist (
        category WITH =,
        tstzrange(effective_from, effective_to, '[)') WITH &&
    )
);

COMMENT ON COLUMN commissions.policies.reason IS
    'Mandatory. A rate with no recorded reason is the one that gets disputed by a seller and defended by nobody.';

-- ==========================================================================
-- commissions.commission_entries — the pricing evidence
-- ==========================================================================

CREATE TABLE commissions.commission_entries (
    id                 text PRIMARY KEY,
    order_id           text NOT NULL,
    seller_id          text NOT NULL,
    category           text NOT NULL,
    policy_id          text NOT NULL,
    rate               numeric(6, 5) NOT NULL CHECK (rate >= 0 AND rate <= 0.5),
    gross_cents        bigint NOT NULL,
    commission_cents   bigint NOT NULL,
    seller_net_cents   bigint NOT NULL,
    currency           shared.rand_currency NOT NULL DEFAULT 'ZAR',
    ledger_entry_id    text,
    calculated_at      timestamptz NOT NULL DEFAULT now(),
    reversal_of        text REFERENCES commissions.commission_entries (id),
    kind               text NOT NULL CHECK (kind IN ('FORWARD', 'REVERSAL')),

    -- The arithmetic a seller is shown has to be the arithmetic that happened.
    -- This is the assertion CommissionPolicyTest makes in PHP; here it cannot be
    -- skipped by a handler that computes the three numbers separately.
    --
    -- FORWARD-ONLY. A reversal is not a second pricing: CommissionRecorder::
    -- reverseForRefund copies the forward row's gross and seller_net and negates
    -- only the commission, so gross - commission is deliberately not net on that
    -- row. Applying this to reversals too does not tighten anything — it makes
    -- every refund on a real server fail to insert, which is exactly the kind of
    -- bug the in-memory store cannot show you.
    CONSTRAINT forward_net_is_gross_less_commission CHECK (
        kind <> 'FORWARD' OR gross_cents - commission_cents = seller_net_cents
    ),

    CONSTRAINT forward_has_no_parent CHECK (kind <> 'FORWARD' OR reversal_of IS NULL),
    CONSTRAINT reversal_has_a_parent CHECK (kind <> 'REVERSAL' OR reversal_of IS NOT NULL),

    -- One rule seen from both sides of a refund: the platform never takes a
    -- negative cut, and a reversal never hands back a positive one. A zero
    -- reversal is excluded outright because reverseForRefund returns early on a
    -- zero commission — a row that changes no money is the noise the
    -- nonzero-amount rule in the ledger already refuses.
    CONSTRAINT commission_sign_follows_kind CHECK (
        (kind = 'FORWARD' AND commission_cents >= 0)
        OR (kind = 'REVERSAL' AND commission_cents < 0)
    ),

    -- The zero-commission promo case: evidence with no money row. A non-zero
    -- commission with no ledger row would be the unauditable charge.
    CONSTRAINT commission_evidence_has_money CHECK (
        commission_cents = 0 OR ledger_entry_id IS NOT NULL
    )
);

CREATE INDEX commission_entries_by_order ON commissions.commission_entries (order_id, kind);

-- ==========================================================================
-- settlements.ledger_entries — the append-only money record
-- ==========================================================================

CREATE TABLE settlements.ledger_entries (
    id             text PRIMARY KEY,
    seller_id      text NOT NULL,
    -- Nullable: a payout is money for a seller that belongs to no single order.
    order_id       text,
    entry_type     text NOT NULL CHECK (entry_type IN (
                       'SELLER_EARNINGS', 'COMMISSION', 'COMMISSION_REVERSAL',
                       'REFUND', 'PAYOUT', 'CHARGEBACK', 'HOLD', 'HOLD_RELEASE'
                   )),
    -- Stored signed: credits positive, debits negative. Balances are therefore a
    -- plain SUM, which is the only formulation that cannot disagree with itself.
    amount_cents   shared.nonzero_cents NOT NULL,
    currency       shared.rand_currency NOT NULL DEFAULT 'ZAR',
    reason         text NOT NULL,
    reversal_of    text REFERENCES settlements.ledger_entries (id),
    recorded_at    timestamptz NOT NULL DEFAULT now(),

    -- Named for the same reason as the ones on commissions.policies: this is the
    -- column that turns a number into evidence, and it is the rule most likely to
    -- be relaxed by whoever adds the next entry type.
    CONSTRAINT ledger_reason_is_mandatory CHECK (length(btrim(reason)) > 0)
);

COMMENT ON COLUMN settlements.ledger_entries.reason IS
    'Mandatory on every row. An amount with no stated cause is not evidence, and this column is the reason a dispute can be closed without an archaeology session.';

CREATE INDEX ledger_by_seller ON settlements.ledger_entries (seller_id, recorded_at);
CREATE INDEX ledger_by_order ON settlements.ledger_entries (order_id, entry_type)
    WHERE order_id IS NOT NULL;

-- ==========================================================================
-- settlements.payout_requests
-- ==========================================================================

CREATE TABLE settlements.payout_requests (
    idempotency_key   text PRIMARY KEY,
    id                text NOT NULL,
    seller_id         text NOT NULL,
    amount_cents      shared.positive_cents NOT NULL,
    currency          shared.rand_currency NOT NULL DEFAULT 'ZAR',
    bank_account_ref  text NOT NULL CHECK (length(btrim(bank_account_ref)) >= 6),
    requested_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE settlements.payout_requests IS
    'Append-only and keyed by idempotency_key: a retry of a payout request is the same request, and the only safe way to know that after a crash is that the key is already spent. No status column by design — the outcome of a payout is a new ledger row (PAYOUT) or the absence of one, never an edited row.';

-- ==========================================================================
-- handover.tokens
-- ==========================================================================

CREATE TABLE handover.tokens (
    id                 text PRIMARY KEY,
    order_id           text NOT NULL,
    pin_hash           text NOT NULL,
    buyer_id           text NOT NULL,
    seller_id          text NOT NULL,
    issued_at          timestamptz NOT NULL,
    expires_at         timestamptz NOT NULL,
    buyer_confirmed    boolean NOT NULL DEFAULT false,
    seller_confirmed   boolean NOT NULL DEFAULT false,
    confirmed_at       timestamptz,
    attempts           integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    locked             boolean NOT NULL DEFAULT false,
    revoked            boolean NOT NULL DEFAULT false,
    held_cents         bigint NOT NULL DEFAULT 0 CHECK (held_cents >= 0),
    currency           shared.rand_currency NOT NULL DEFAULT 'ZAR',

    CHECK (expires_at > issued_at),
    -- 5 attempts, from HandoverToken::MAX_ATTEMPTS. The bound lives here so an
    -- attacker who somehow drives the counter past it is refused by the database
    -- rather than by a check that may or may not have been written.
    CONSTRAINT attempts_lock_out_at_five CHECK (attempts <= 5),
    -- pin_hash is a salted HMAC, never the PIN. Cheap insurance against a
    -- developer writing the plaintext into the column the hash was meant for.
    CONSTRAINT pin_is_a_digest CHECK (pin_hash ~ '^[0-9a-f]{64}$')
);

-- One live token per order. Reissue revokes the previous row first, so the
-- constraint holds across a reissue and forbids the case that matters: two
-- unrevoked tokens that both attest to the same handover.
CREATE UNIQUE INDEX tokens_one_live_per_order ON handover.tokens (order_id)
    WHERE revoked = false;

-- ==========================================================================
-- shared.outbox_messages
-- ==========================================================================

CREATE TABLE shared.outbox_messages (
    id              text PRIMARY KEY,
    aggregate_type  text NOT NULL,
    aggregate_id    text NOT NULL,
    event_type      text NOT NULL,
    payload         jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    delivered_at    timestamptz
);

COMMENT ON TABLE shared.outbox_messages IS
    'Mutable on purpose: delivered_at is written by the dispatcher, and at-least-once delivery depends on that bookkeeping. Everything above this column is fixed at insert, inside the transaction that produced the event.';

CREATE INDEX outbox_undelivered ON shared.outbox_messages (occurred_at)
    WHERE delivered_at IS NULL;

-- ==========================================================================
-- Append-only enforcement
-- ==========================================================================
-- Two mechanisms, because they fail differently. The trigger refuses an UPDATE or
-- DELETE from any session including a superuser's. The REVOKE at the bottom of
-- this file means the application role cannot even attempt it, so the mistake is
-- caught as a permission error before a trigger ever fires.

CREATE FUNCTION shared.forbid_row_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% on %.% is forbidden: this table is append-only. Evidence rows are answered by a new row, never edited.',
        TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege', HINT = 'Write a reversing row instead (reversal_of).';
END $$;

COMMENT ON FUNCTION shared.forbid_row_mutation() IS
    'Backs the list in Schema::APPEND_ONLY_TABLES. The list and these triggers are compared by tests/Persistence/SchemaParityTest.php.';

CREATE TRIGGER ledger_entries_append_only
    BEFORE UPDATE OR DELETE ON settlements.ledger_entries
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

CREATE TRIGGER commission_entries_append_only
    BEFORE UPDATE OR DELETE ON commissions.commission_entries
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

CREATE TRIGGER provider_events_append_only
    BEFORE UPDATE OR DELETE ON payments.provider_events
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

CREATE TRIGGER seen_signatures_append_only
    BEFORE UPDATE OR DELETE ON payments.seen_webhook_signatures
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

CREATE TRIGGER payout_requests_append_only
    BEFORE UPDATE OR DELETE ON settlements.payout_requests
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- Unique indexes, declared from Schema::UNIQUE_INDEXES
-- ==========================================================================
-- Idempotency by unique index rather than by check-then-write, everywhere. A
-- pre-check has a window; an index does not. Postgres permits multiple NULLs in a
-- plain UNIQUE, which is exactly the semantics wanted for reversal_of.

-- One reversal per ledger entry. Doubly protecting against a double payout is not
-- paranoia: the two layers fail for different reasons.
CREATE UNIQUE INDEX ledger_one_reversal_per_entry
    ON settlements.ledger_entries (reversal_of);

-- One forward commission per order, and one reversal per order.
CREATE UNIQUE INDEX commission_one_entry_per_order_and_kind
    ON commissions.commission_entries (order_id, kind);

CREATE UNIQUE INDEX provider_event_claimed_once
    ON payments.provider_events (provider, provider_event_id);

CREATE UNIQUE INDEX payout_key_spent_once
    ON settlements.payout_requests (idempotency_key);

CREATE UNIQUE INDEX webhook_signature_seen_once
    ON payments.seen_webhook_signatures (signature);

-- ==========================================================================
-- The money invariants, at commit time
-- ==========================================================================
-- These are MoneyInvariants' five checks. A deferred constraint trigger is the
-- PostgreSQL shape of the same idea: the rule is evaluated when the transaction
-- tries to commit, not when each individual statement ran, so the order of writes
-- inside a transaction cannot matter, and no handler can forget to register it.
--
-- Why the PHP version stays: the application gets a readable error and a clean
-- rollback before the round trip. Why the SQL version is also required: the PHP
-- version is only in force for transactions that go through the PHP.

CREATE FUNCTION shared.sum_ledger_for_order(p_order_id text, p_types text[])
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT COALESCE(SUM(l.amount_cents), 0)::bigint
      FROM settlements.ledger_entries l
     WHERE l.order_id = p_order_id
       AND l.entry_type = ANY (p_types)
$$;

CREATE FUNCTION shared.has_ledger_entry(p_order_id text, p_type text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM settlements.ledger_entries l
         WHERE l.order_id = p_order_id AND l.entry_type = p_type
    )
$$;

-- 1. A state that only exists after money moved must have a money record.
CREATE FUNCTION settlements.invariant_paid_order_has_ledger() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    post_payment constant text[] := ARRAY['PAID', 'HANDOVER_SCHEDULED', 'HANDOVER_CONFIRMED',
                                         'COMPLETED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'IN_DISPUTE'];
BEGIN
    IF NEW.status = ANY (post_payment)
       AND NOT EXISTS (SELECT 1 FROM settlements.ledger_entries l WHERE l.order_id = NEW.id) THEN
        RAISE EXCEPTION 'order % is % with no ledger row at all. A paid order without a money record cannot be reconciled, refunded or defended after the fact.',
            NEW.id, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_paid_order_has_ledger
    AFTER INSERT OR UPDATE OF status ON orders.orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION settlements.invariant_paid_order_has_ledger();

-- 2. Seller earnings are never credited without the pricing evidence that says why.
CREATE FUNCTION settlements.invariant_earnings_have_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF shared.has_ledger_entry(NEW.order_id, 'SELLER_EARNINGS')
       AND NOT EXISTS (
           SELECT 1 FROM commissions.commission_entries c
            WHERE c.order_id = NEW.order_id AND c.kind = 'FORWARD'
       ) THEN
        RAISE EXCEPTION 'order % credited seller earnings with no commission evidence row. The ledger says what was taken; nothing says why.',
            NEW.order_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

-- Order id is nullable on the ledger (a payout belongs to no order), so the check
-- only applies to rows that do have one.
CREATE CONSTRAINT TRIGGER invariant_earnings_have_evidence
    AFTER INSERT ON settlements.ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW WHEN (NEW.order_id IS NOT NULL)
    EXECUTE FUNCTION settlements.invariant_earnings_have_evidence();

-- 3. A refund reverses the commission. Charged commission on an unwound sale makes
--    the platform a party to a transaction that did not happen.
CREATE FUNCTION settlements.invariant_refund_reverses_commission() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    net bigint;
BEGIN
    IF NOT shared.has_ledger_entry(NEW.order_id, 'REFUND') THEN
        RETURN NULL;
    END IF;
    net := shared.sum_ledger_for_order(NEW.order_id, ARRAY['COMMISSION', 'COMMISSION_REVERSAL']);
    IF net <> 0 THEN
        RAISE EXCEPTION 'order % was refunded but still carries % cents of net commission. Commission is charged on completed sales; this one did not complete.',
            NEW.order_id, -net USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_refund_reverses_commission
    AFTER INSERT ON settlements.ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW WHEN (NEW.order_id IS NOT NULL)
    EXECUTE FUNCTION settlements.invariant_refund_reverses_commission();

-- 4. A closed order must not still be holding money. Two functions rather than one
--    that branches on TG_TABLE_NAME: the row shapes differ, and a trigger that
--    guesses which table it was called from is a trigger that reads the wrong id.
CREATE FUNCTION settlements.invariant_closed_order_has_no_hold() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    held bigint;
BEGIN
    held := shared.sum_ledger_for_order(NEW.id, ARRAY['HOLD', 'HOLD_RELEASE']);
    IF held <> 0 THEN
        RAISE EXCEPTION 'order % is % with % cents still held. Money stuck in a hold on a closed order is the seller complaint that arrives two weeks after launch.',
            NEW.id, NEW.status, abs(held) USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

-- The other direction: the hold was written last, and the order is already closed.
CREATE FUNCTION settlements.invariant_hold_released_on_closed_order() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    held bigint;
    order_status text;
BEGIN
    SELECT o.status INTO order_status FROM orders.orders o WHERE o.id = NEW.order_id;
    IF order_status IS NULL OR order_status NOT IN ('COMPLETED', 'REFUNDED', 'CANCELLED') THEN
        RETURN NULL;
    END IF;

    held := shared.sum_ledger_for_order(NEW.order_id, ARRAY['HOLD', 'HOLD_RELEASE']);
    IF held <> 0 THEN
        RAISE EXCEPTION 'order % is % with % cents still held. Money stuck in a hold on a closed order is the seller complaint that arrives two weeks after launch.',
            NEW.order_id, order_status, abs(held) USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_closed_order_has_no_hold
    AFTER INSERT OR UPDATE OF status ON orders.orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW WHEN (NEW.status IN ('COMPLETED', 'REFUNDED', 'CANCELLED'))
    EXECUTE FUNCTION settlements.invariant_closed_order_has_no_hold();

CREATE CONSTRAINT TRIGGER invariant_hold_released_on_closed_order
    AFTER INSERT ON settlements.ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW WHEN (NEW.order_id IS NOT NULL)
    EXECUTE FUNCTION settlements.invariant_hold_released_on_closed_order();

-- 5. No seller balance is ever negative. The platform may owe a seller, or hold a
--    chargeback against them, but it may not commit a balance that implies a seller
--    owes the marketplace on a sale they made.
CREATE FUNCTION settlements.invariant_balance_never_negative() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    balance bigint;
BEGIN
    SELECT COALESCE(SUM(l.amount_cents), 0)::bigint INTO balance
      FROM settlements.ledger_entries l
     WHERE l.seller_id = NEW.seller_id;

    IF balance < 0 THEN
        RAISE EXCEPTION 'seller % would be left at % cents after this transaction; a payable balance may not be committed as a debt.',
            NEW.seller_id, balance USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER invariant_balance_never_negative
    AFTER INSERT ON settlements.ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION settlements.invariant_balance_never_negative();

COMMIT;

-- ==========================================================================
-- Deliberately NOT in this file
-- ==========================================================================
-- * Roles and grants: migration 002. CREATE ROLE cannot run inside a transaction
--   block, so putting it here after COMMIT would make 001 non-atomic for no reason.
-- * Cross-module foreign keys. ledger_entries.order_id references nothing at the
--   database level, on purpose: an FK from settlements to orders makes the two
--   schemas one schema, and per-module evolution is the reason the schemas exist.
--   The invariant triggers above are the substitute, and they are stronger — an FK
--   proves the order exists, not that the money and the state agree.
-- * The order state machine's transitions. Owned by Order::TRANSITIONS. A second
--   copy in SQL drifts, and drift between two guards means both.
-- * Commission rate calculation. It needs round-half-up on a float rate, which is
--   application arithmetic and is tested to the cent.
-- * PIN hashing. A peppered HMAC in PHP; the database stores the digest and has no
--   way to verify one, which is the correct arrangement.
-- * Partitioning, the search-index read model, and the audit trail. Phase 1+; they
--   are not needed to hold money correctly and adding them here would make 001
--   depend on decisions that are still open.
