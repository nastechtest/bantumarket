-- NasTech Market — notifications, PostgreSQL DDL (migration 010)
--
-- Owns schema `notifications`. Written against src/Notifications/Schema.php; the
-- parity and row-semantics tests are tests/Notifications/NotificationDdlTest.php,
-- using tests/Support/DdlRowChecks.php. Like every migration in this tree this
-- file has NOT been run: there is no PostgreSQL and no PDO driver here.
-- `psql -v ON_ERROR_STOP=1` against a real cluster remains a deploy gate.
--
-- The design constraint everything below serves: a notification is a record of an
-- event the account must be able to see, not an email and not a message. It keeps
-- an opaque recipient reference, a kind from a closed vocabulary, the module and
-- subject that caused it, and channel attempts. It never keeps a phone number, an
-- email address, a message body or anything from a dispute; those live in the
-- module that owns them, under that module's audience rule.
--
-- Idempotency is structural, not a pre-check: (source_event_id, recipient_id,
-- kind) is unique, and (notification_id, channel, attempt_no) is unique, so a
-- replayed event and a retried delivery both find the first row instead of
-- writing a second one.

BEGIN;

CREATE SCHEMA notifications;

COMMENT ON SCHEMA notifications IS
    'Opaque event notifications for one account, plus append-only channel attempts. No outbound module edges: every input is an outbox event id, recipient, kind and subject id.';

-- ==========================================================================
-- notifications.notifications
-- ==========================================================================

CREATE TABLE notifications.notifications (
    id                text PRIMARY KEY,
    -- The outbox message id. Part of the idempotency key, never a copy of the
    -- event payload: the consumer can always go back to the outbox row.
    source_event_id   text NOT NULL,
    -- An opaque Identity account reference. Deliberately not a foreign key to
    -- identity.*: the schemas are module boundaries, and this row must survive
    -- a notification whose account is later closed.
    recipient_id      text NOT NULL,
    -- Closed vocabulary. A template name or a free-text event label does not
    -- belong here; the kind is what the recipient is being told to look at.
    kind              text NOT NULL,
    -- Derived from kind and checked below. Stored rather than joined so an
    -- operator can answer "what caused this" without reading another schema.
    source_module     text NOT NULL,
    subject_type      text NOT NULL,
    -- The opaque id of the thread/order/dispute/payout/listing/capture. Never a
    -- body, an address or a case narrative.
    subject_id        text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    -- Nullable: NULL means unread, never "unknown time". A notification can only
    -- be marked read after it exists, and the CHECK refuses a read instant that
    -- precedes creation.
    read_at           timestamptz,

    CONSTRAINT notification_kind_is_known CHECK (
        kind IN (
            'MESSAGE_RECEIVED',
            'ORDER_PLACED',
            'ORDER_COMPLETED',
            'DISPUTE_OPENED',
            'DISPUTE_DECIDED',
            'PAYOUT_RELEASED',
            'LISTING_WENT_LIVE',
            'CAPTURE_FAILED'
        )
    ),
    CONSTRAINT notification_source_is_known CHECK (
        source_module IN ('Messaging', 'Orders', 'Disputes', 'Settlements', 'Listings', 'Capture')
    ),
    CONSTRAINT notification_subject_type_is_known CHECK (
        subject_type IN ('thread', 'order', 'dispute', 'payout', 'listing', 'capture')
    ),
    -- A producer cannot file an order event against a thread: the pair is closed
    -- in code by NotificationKind and here by the row.
    CONSTRAINT notification_kind_matches_its_source CHECK (
        (kind = 'MESSAGE_RECEIVED' AND source_module = 'Messaging' AND subject_type = 'thread')
        OR (kind = 'ORDER_PLACED' AND source_module = 'Orders' AND subject_type = 'order')
        OR (kind = 'ORDER_COMPLETED' AND source_module = 'Orders' AND subject_type = 'order')
        OR (kind = 'DISPUTE_OPENED' AND source_module = 'Disputes' AND subject_type = 'dispute')
        OR (kind = 'DISPUTE_DECIDED' AND source_module = 'Disputes' AND subject_type = 'dispute')
        OR (kind = 'PAYOUT_RELEASED' AND source_module = 'Settlements' AND subject_type = 'payout')
        OR (kind = 'LISTING_WENT_LIVE' AND source_module = 'Listings' AND subject_type = 'listing')
        OR (kind = 'CAPTURE_FAILED' AND source_module = 'Capture' AND subject_type = 'capture')
    ),
    CONSTRAINT source_event_is_an_opaque_id CHECK (source_event_id ~ '^[A-Za-z0-9_-]{1,64}$'),
    CONSTRAINT recipient_is_an_opaque_account CHECK (recipient_id ~ '^[A-Za-z0-9_-]{1,64}$'),
    CONSTRAINT subject_is_an_opaque_id CHECK (subject_id ~ '^[A-Za-z0-9_-]{1,64}$'),
    CONSTRAINT read_does_not_precede_creation CHECK (read_at IS NULL OR read_at >= created_at)
);

COMMENT ON TABLE notifications.notifications IS
    'One row per event a recipient must see, deduplicated by (source_event_id, recipient_id, kind). The only retained references are opaque ids; content stays in the module that owns it.';

COMMENT ON COLUMN notifications.notifications.source_event_id IS
    'The outbox message id. A replayed event finds this row rather than inserting a second notification.';

COMMENT ON COLUMN notifications.notifications.read_at IS
    'NULL = unread. The CHECK refuses a read instant earlier than created_at; the service refuses a read for a notification that does not exist.';

-- The idempotency rule. It is an index rather than a read-then-write because
-- two consumers can race the same replay; the loser gets the winner's row.
CREATE UNIQUE INDEX one_notification_per_event_recipient_and_kind
    ON notifications.notifications (source_event_id, recipient_id, kind);

CREATE INDEX notifications_by_recipient_created
    ON notifications.notifications (recipient_id, created_at DESC);

-- ==========================================================================
-- notifications.delivery_attempts — append-only evidence of a send
-- ==========================================================================

CREATE TABLE notifications.delivery_attempts (
    id              text PRIMARY KEY,
    -- The notification this attempt belongs to. The FK is what makes "a delivery
    -- attempt requires a notification" true even for a writer that bypasses the
    -- service; the service also checks first so the caller gets a domain refusal.
    notification_id text NOT NULL REFERENCES notifications.notifications (id),
    -- Where the attempt went. No address column: Identity resolves the address
    -- at send time, and this table never holds it.
    channel         text NOT NULL,
    -- Starts at 1 and increases per (notification, channel). The unique index is
    -- the retry rule: attempt 2 is a new row, re-running attempt 1 is the same row.
    attempt_no      integer NOT NULL,
    status          text NOT NULL,
    attempted_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT attempt_channel_is_known CHECK (channel IN ('IN_APP', 'EMAIL', 'PUSH', 'SMS')),
    CONSTRAINT attempt_number_starts_positive CHECK (attempt_no >= 1),
    CONSTRAINT attempt_status_is_known CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'SUPPRESSED'))
);

COMMENT ON TABLE notifications.delivery_attempts IS
    'Append-only channel attempts. A failed send is answered by the next attempt number; no UPDATE or DELETE is granted or trigger-permitted. The unique key makes a retry idempotent.';

COMMENT ON COLUMN notifications.delivery_attempts.channel IS
    'A channel name only. The phone number, email address or device token belongs to Identity and is never copied here.';

CREATE UNIQUE INDEX one_attempt_per_notification_channel_and_number
    ON notifications.delivery_attempts (notification_id, channel, attempt_no);

CREATE INDEX attempts_by_notification
    ON notifications.delivery_attempts (notification_id, attempted_at);

CREATE TRIGGER notification_attempts_append_only
    BEFORE UPDATE OR DELETE ON notifications.delivery_attempts
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- Grants (002's shape): least privilege, never TRUNCATE or DDL
-- ==========================================================================

GRANT USAGE ON SCHEMA notifications TO nastech_app;
GRANT USAGE ON SCHEMA notifications TO nastech_owner;

-- Mutable in exactly one column: read_at. There is no DELETE: an account's
-- notification history is not repaired by removing rows.
GRANT SELECT, INSERT, UPDATE ON notifications.notifications TO nastech_app;

-- Evidence: read and append only.
GRANT SELECT, INSERT ON notifications.delivery_attempts TO nastech_app;

-- Owner reads for reporting. UPDATE on evidence is deliberately absent.
GRANT SELECT ON ALL TABLES IN SCHEMA notifications TO nastech_owner;

COMMIT;
