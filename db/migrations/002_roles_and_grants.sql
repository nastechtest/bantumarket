-- NasTech Market — roles and least-privilege grants
--
-- Split out of 001 because CREATE ROLE cannot run inside a transaction block.
-- That is not a cosmetic reason: it means this migration is not atomic, so it is
-- written to be re-runnable instead. Re-running it is safe (GRANT is idempotent),
-- but a failure half-way leaves roles missing rather than leaving the money path
-- half-created, which is the failure you would rather have.
--
-- STATE: not executed against a real server. See the header of 001_money_path.sql.
--
-- The point of this file: a role that can UPDATE the ledger is a role that can
-- quietly change what a seller was paid, whatever the triggers in 001 say. The
-- triggers are the backstop for sessions that are not this role — psql, a support
-- script, a migration that got the WHERE clause wrong.

-- ==========================================================================

-- ==========================================================================
-- Grants: the least privilege the money path can be run with
-- ==========================================================================
-- A role that can UPDATE the ledger is a role that can quietly change what a
-- seller was paid, whatever the triggers say. The triggers are the backstop for
-- sessions that are not this role.

CREATE ROLE nastech_app NOLOGIN;
CREATE ROLE nastech_owner NOLOGIN;

GRANT USAGE ON SCHEMA shared, catalogue, orders, payments, commissions, settlements, handover TO nastech_app;
GRANT USAGE ON SCHEMA shared, catalogue, orders, payments, commissions, settlements, handover TO nastech_owner;

-- Mutable tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON
    catalogue.listings,
    orders.orders,
    handover.tokens,
    shared.outbox_messages,
    payments.payment_discrepancies
TO nastech_app;

-- Read and append only: the five tables from Schema::APPEND_ONLY_TABLES.
GRANT SELECT, INSERT ON
    settlements.ledger_entries,
    commissions.commission_entries,
    payments.provider_events,
    payments.seen_webhook_signatures,
    settlements.payout_requests
TO nastech_app;

-- The policies table is written by an admin path, not by the money path.
GRANT SELECT ON commissions.policies TO nastech_app;
GRANT SELECT, INSERT, UPDATE ON commissions.policies TO nastech_owner;

-- Constraint triggers read across schemas; the invoker needs SELECT on what they
-- read. This is why the invariant functions are SECURITY INVOKER by default and
-- deliberately not definer functions.
GRANT SELECT ON ALL TABLES IN SCHEMA settlements, commissions, orders TO nastech_app;

ALTER FUNCTION shared.forbid_row_mutation() OWNER TO nastech_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA settlements GRANT SELECT ON TABLES TO nastech_app;

GRANT nastech_app TO nastech_owner;
