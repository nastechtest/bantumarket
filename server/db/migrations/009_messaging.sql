-- NasTech Market — messaging, PostgreSQL DDL (migration 009)
--
-- Owns schema `messaging`. Written against src/Messaging/Schema.php; the parity and
-- row-semantics tests are tests/Messaging/MessagingDdlTest.php, using
-- tests/Support/DdlRowChecks.php. Like every migration in this tree this file has
-- NOT been run: there is no PostgreSQL and no PDO driver here.
-- `psql -v ON_ERROR_STOP=1` against a real cluster remains a deploy gate.
--
-- The one design constraint everything below serves: a chat message is not evidence
-- in a dispute. The thread is therefore bound to a listing or an order, append-only,
-- visible to its two parties (plus a capability-checked audit read), and the event
-- payloads that leave this module carry ids and classifications but never a body, a
-- phone number, an email address or a street address. Those facts live in the order,
-- the listing and the handover record, where a dispute already looks.

BEGIN;

CREATE SCHEMA messaging;

COMMENT ON SCHEMA messaging IS
    'Order/listing-scoped threads, append-only message versions, per-device read state, reports and a Safety-fed block projection. Outbound edge: Identity only.';

-- ==========================================================================
-- messaging.threads
-- ==========================================================================

CREATE TABLE messaging.threads (
    id              text PRIMARY KEY,
    -- The deduplication identity: 'order:<id>' or 'listing:<id>'. Text rather than a
    -- pair of nullable columns because a unique index over a nullable column does not
    -- deduplicate a NULL, and two taps on "message seller" must not open two threads.
    context_key     text NOT NULL,
    -- Both nullable individually, at least one non-null, enforced by
    -- thread_has_a_context. An order context carries both so the thread can still be
    -- found after the listing is withdrawn.
    listing_id      text,
    order_id        text,
    buyer_id        text NOT NULL,
    seller_id       text NOT NULL,
    status          text NOT NULL DEFAULT 'OPEN',
    message_count   integer NOT NULL DEFAULT 0,
    -- Optimistic CAS, the same shape as orders.orders: every append advances it and
    -- the writer submits the version it loaded. The shared trigger refuses an update
    -- that does not advance it, so code that forgot to compare still cannot overwrite.
    version         integer NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    -- Nullable: a thread exists before anybody has said anything. NULL means "no
    -- message yet", never "unknown time".
    last_message_at timestamptz,
    -- Nullable exactly when status = OPEN. A CLOSED thread has both, so "why did
    -- writes stop" is answerable without reading an event stream.
    closed_at       timestamptz,
    closed_reason   text,
    -- Denormalised inbox sort key, '<atom>|<id>'. It exists so the inbox is a keyset
    -- page rather than an OFFSET over a mutable sort; the unique index below is the
    -- real identity.
    activity_key    text NOT NULL,

    CONSTRAINT thread_has_two_different_parties CHECK (buyer_id <> seller_id),
    CONSTRAINT thread_has_a_context CHECK (listing_id IS NOT NULL OR order_id IS NOT NULL),
    CONSTRAINT thread_status_is_known CHECK (status IN ('OPEN', 'CLOSED')),
    CONSTRAINT a_closed_thread_states_when_and_why CHECK (
        status <> 'CLOSED'
        OR (closed_at IS NOT NULL AND closed_reason IS NOT NULL AND length(btrim(closed_reason)) > 0)
    ),
    CONSTRAINT an_open_thread_has_no_close_time CHECK (status <> 'OPEN' OR closed_at IS NULL),
    CONSTRAINT thread_version_starts_positive CHECK (version >= 1),
    CONSTRAINT thread_message_count_is_not_negative CHECK (message_count >= 0)
);

COMMENT ON TABLE messaging.threads IS
    'One conversation per (context, buyer, seller). buyer_id and seller_id are opaque Identity ids; the migration cannot join them because schemas are module boundaries, and that is the point.';

CREATE UNIQUE INDEX thread_is_unique_per_context_and_pair
    ON messaging.threads (context_key, buyer_id, seller_id);

CREATE INDEX threads_by_buyer_activity ON messaging.threads (buyer_id, activity_key DESC);
CREATE INDEX threads_by_seller_activity ON messaging.threads (seller_id, activity_key DESC);

CREATE TRIGGER messaging_threads_version_monotonic
    BEFORE UPDATE ON messaging.threads
    FOR EACH ROW EXECUTE FUNCTION shared.assert_order_version_monotonic();

-- ==========================================================================
-- messaging.messages — append-only versions
-- ==========================================================================

CREATE TABLE messaging.messages (
    id                text PRIMARY KEY,
    thread_id         text NOT NULL,
    -- Strictly increasing per thread, allocated inside the same transaction as the
    -- thread version bump. The unique index is what makes two racing sends produce one
    -- message 7 and one StaleThreadVersion rather than two message 7s.
    sequence          integer NOT NULL,
    sender_id         text NOT NULL,
    kind              text NOT NULL,
    -- Nullable only for a TOMBSTONE: the row that records a delete carries no body.
    -- A live version with a NULL body is refused by a_live_version_has_a_body, so
    -- "no body" cannot be used to smuggle a message past content scanning.
    body              text,
    -- sha256 of the body, always present (the tombstone stores sha256('')). It makes
    -- an edited body detectable without keeping a second copy in an event.
    body_digest       text NOT NULL,
    -- Nullable on the first version; set on EDIT and TOMBSTONE. The old row is kept,
    -- which is why the chain, not an UPDATE, is the model.
    supersedes_id     text,
    -- The sender's retry token. Required rather than optional: a retried POST with a
    -- fresh id is how one message becomes two.
    client_message_id text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT message_kind_is_known CHECK (kind IN ('MESSAGE', 'EDIT', 'TOMBSTONE')),
    CONSTRAINT message_sequence_is_positive CHECK (sequence > 0),
    CONSTRAINT a_tombstone_has_no_body CHECK (kind <> 'TOMBSTONE' OR body IS NULL),
    CONSTRAINT a_live_version_has_a_body CHECK (kind = 'TOMBSTONE' OR body IS NOT NULL),
    CONSTRAINT body_digest_is_sha256 CHECK (body_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT a_version_does_not_supersede_itself CHECK (supersedes_id IS NULL OR supersedes_id <> id),
    CONSTRAINT only_the_first_version_has_no_parent CHECK (
        (kind = 'MESSAGE' AND supersedes_id IS NULL)
        OR (kind <> 'MESSAGE' AND supersedes_id IS NOT NULL)
    )
);

COMMENT ON TABLE messaging.messages IS
    'Append-only message versions. An edit inserts EDIT pointing at the row it supersedes; a delete inserts TOMBSTONE pointing at it. No UPDATE and no DELETE is granted or trigger-permitted.';

CREATE UNIQUE INDEX message_sequence_is_unique_per_thread
    ON messaging.messages (thread_id, sequence);

CREATE UNIQUE INDEX a_senders_retry_is_one_message
    ON messaging.messages (thread_id, sender_id, client_message_id);

CREATE UNIQUE INDEX a_version_supersedes_at_most_one_row
    ON messaging.messages (supersedes_id);

CREATE INDEX messages_by_thread_sequence ON messaging.messages (thread_id, sequence);

CREATE TRIGGER messaging_messages_append_only
    BEFORE UPDATE OR DELETE ON messaging.messages
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- messaging.message_attachments — references, never bytes
-- ==========================================================================

CREATE TABLE messaging.message_attachments (
    id          text PRIMARY KEY,
    message_id  text NOT NULL,
    -- An opaque Media id. Not a storage key and not a URL: a URL is a credential with
    -- a TTL, and a chat export would carry it forever.
    media_id    text NOT NULL,
    kind        text NOT NULL,
    position    integer NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT attachment_kind_is_known CHECK (kind IN ('PHOTO', 'VIDEO', 'DOCUMENT')),
    CONSTRAINT attachment_position_is_bounded CHECK (position >= 0 AND position <= 3),
    CONSTRAINT media_reference_is_not_a_path CHECK (media_id ~ '^[A-Za-z0-9_-]{1,64}$')
);

COMMENT ON TABLE messaging.message_attachments IS
    'Four attachment references per message at most, deduplicated per message. Messaging never stores the bytes and never issues a read URL; Media does that with its own audience.';

CREATE UNIQUE INDEX an_attachment_is_listed_once_per_message
    ON messaging.message_attachments (message_id, media_id);

CREATE UNIQUE INDEX an_attachment_position_is_used_once
    ON messaging.message_attachments (message_id, position);

CREATE TRIGGER messaging_attachments_append_only
    BEFORE UPDATE OR DELETE ON messaging.message_attachments
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- messaging.contact_flags — evidence a pattern matched, not a verdict
-- ==========================================================================

CREATE TABLE messaging.contact_flags (
    id           text PRIMARY KEY,
    thread_id    text NOT NULL,
    message_id   text NOT NULL,
    category     text NOT NULL,
    rule_id      text NOT NULL,
    risk         text NOT NULL,
    -- Exactly one value. There is deliberately no numeric confidence: a regex has no
    -- opinion about whether a person was defrauded, and a column that could hold 0.87
    -- would be read as one.
    confidence   text NOT NULL,
    -- The matched text, retained for a human reviewer. It is never put in an outbox
    -- payload; the event carries rule_id only.
    matched_text text NOT NULL,
    detected_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT flag_category_is_known CHECK (category IN ('CONTACT_DETAILS', 'OFF_PLATFORM_MIGRATION', 'PAYMENT_INSTRUCTION')),
    CONSTRAINT flag_risk_is_known CHECK (risk IN ('INFORMATIONAL', 'ELEVATED')),
    CONSTRAINT flag_confidence_is_pattern_only CHECK (confidence = 'pattern'),
    CONSTRAINT flag_rule_id_is_snake_case CHECK (rule_id ~ '^[a-z][a-z0-9_]{2,63}$')
);

COMMENT ON TABLE messaging.contact_flags IS
    'Content-safety findings with the matched text retained as evidence. A finding is a pattern match; the sanction decision belongs to Safety and is not stored here.';

CREATE UNIQUE INDEX one_flag_per_rule_per_message
    ON messaging.contact_flags (message_id, rule_id);

CREATE TRIGGER messaging_flags_append_only
    BEFORE UPDATE OR DELETE ON messaging.contact_flags
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- messaging.thread_reports — the abuse path
-- ==========================================================================

CREATE TABLE messaging.thread_reports (
    id               text PRIMARY KEY,
    thread_id        text NOT NULL,
    reporter_id      text NOT NULL,
    reason           text NOT NULL,
    -- Nullable: most reports need no free text. OTHER requires it, enforced below, so
    -- "other" cannot be a dead end with no information.
    details          text,
    -- Nullable: a report can be about the conversation as a whole rather than one
    -- message. When present it points into the same thread's sequence space.
    message_sequence integer,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT report_reason_is_known CHECK (
        reason IN ('HARASSMENT', 'SCAM', 'SPAM', 'OFF_PLATFORM_PRESSURE', 'OTHER')
    ),
    CONSTRAINT an_other_report_states_what_happened CHECK (reason <> 'OTHER' OR details IS NOT NULL)
);

COMMENT ON TABLE messaging.thread_reports IS
    'Append-only reports from participants. Messaging takes no sanctioning decision and holds no sanction state; the report and its event are the whole of its responsibility.';

CREATE TRIGGER messaging_reports_append_only
    BEFORE UPDATE OR DELETE ON messaging.thread_reports
    FOR EACH ROW EXECUTE FUNCTION shared.forbid_row_mutation();

-- ==========================================================================
-- messaging.read_state — per device, CAS on version
-- ==========================================================================

CREATE TABLE messaging.read_state (
    id                 text PRIMARY KEY,
    thread_id          text NOT NULL,
    reader_id          text NOT NULL,
    -- One installation. Two devices belonging to one person have two rows so a
    -- notification opened on a phone cannot mark the same message read on a tablet.
    device_id          text NOT NULL,
    last_read_sequence integer NOT NULL DEFAULT 0,
    version            integer NOT NULL DEFAULT 1,
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT read_cursor_is_not_negative CHECK (last_read_sequence >= 0),
    CONSTRAINT read_version_starts_positive CHECK (version >= 1)
);

COMMENT ON TABLE messaging.read_state IS
    'Per (thread, reader, device) read cursor. The unique index and CAS version are the two-device race rule; the cursor never moves backwards.';

CREATE UNIQUE INDEX read_state_is_per_device
    ON messaging.read_state (thread_id, reader_id, device_id);

CREATE TRIGGER messaging_read_state_version_monotonic
    BEFORE UPDATE ON messaging.read_state
    FOR EACH ROW EXECUTE FUNCTION shared.assert_order_version_monotonic();

-- ==========================================================================
-- messaging.contact_blocks — Safety's decision, projected
-- ==========================================================================

CREATE TABLE messaging.contact_blocks (
    id               text PRIMARY KEY,
    blocker_id       text NOT NULL,
    blocked_id       text NOT NULL,
    reason           text NOT NULL,
    -- Idempotency for the outbox consumer: an at-least-once ContactBlocked replay
    -- finds this row and does nothing. Not a foreign key; Safety owns the event.
    source_event_id  text NOT NULL,
    active           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    -- Nullable while active. A released block states when, and which event released
    -- it, so a replayed unblock is also a no-op.
    released_at      timestamptz,
    release_event_id text,

    CONSTRAINT a_block_is_not_self CHECK (blocker_id <> blocked_id),
    CONSTRAINT a_block_records_a_reason CHECK (length(btrim(reason)) > 0),
    CONSTRAINT a_released_block_states_when CHECK (active = true OR released_at IS NOT NULL)
);

COMMENT ON TABLE messaging.contact_blocks IS
    'A projection of Safety decisions, not a second block system. Messaging only reads it to refuse a send or a new thread.';

CREATE UNIQUE INDEX a_block_event_is_applied_once
    ON messaging.contact_blocks (source_event_id);

CREATE UNIQUE INDEX an_unblock_event_is_applied_once
    ON messaging.contact_blocks (release_event_id);

-- ==========================================================================
-- Grants (002's shape): least privilege, never TRUNCATE or DDL
-- ==========================================================================

GRANT USAGE ON SCHEMA messaging TO nastech_app;
GRANT USAGE ON SCHEMA messaging TO nastech_owner;

-- Mutable: a thread advances, a read cursor moves, a block is released. No DELETE:
-- closing is a state, not a row removal, and a block is released, not deleted.
GRANT SELECT, INSERT, UPDATE ON
    messaging.threads,
    messaging.read_state,
    messaging.contact_blocks
TO nastech_app;

-- Evidence: read and append only.
GRANT SELECT, INSERT ON
    messaging.messages,
    messaging.message_attachments,
    messaging.contact_flags,
    messaging.thread_reports
TO nastech_app;

-- The audit read runs under the application role with a capability check in the
-- command, not as a second role. Owner gets read access for reporting; UPDATE on
-- evidence is deliberately absent even for owner, because there is no correction
-- path that needs one.
GRANT SELECT ON ALL TABLES IN SCHEMA messaging TO nastech_owner;

COMMIT;
