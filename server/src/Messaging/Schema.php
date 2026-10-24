<?php

declare(strict_types=1);

namespace NasTech\Messaging;

use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Schema as SharedSchema;

/**
 * Messaging's constraints, as data.
 *
 * The migration (009_messaging.sql) declares the same lists. tests/Messaging/
 * MessagingDdlTest compares them in both directions and feeds real rows through
 * every CHECK with tests/Support/DdlRowChecks.php; a rule that exists only here is
 * a rule production does not enforce, and a rule that exists only there is one the
 * in-memory tests cannot exercise.
 *
 * The load-bearing entries:
 *   - messages / message_attachments / contact_flags / thread_reports are append-only.
 *     An edit or a delete is a new row; an attachment is evidence of what was sent.
 *   - (context_key, buyer_id, seller_id) is unique: two taps produce one thread.
 *   - (thread_id, sequence) is unique: two racing sends cannot share message 7.
 *   - (thread_id, sender_id, client_message_id) is unique: a retried POST is the
 *     same message, not a duplicate.
 *   - (thread_id, reader_id, device_id) is unique: read state is per device.
 */
final class Schema
{
    /**
     * @var array<string, string> bare table => "schema.table"
     */
    public const TABLES = [
        'messaging_threads' => 'messaging.threads',
        'messaging_messages' => 'messaging.messages',
        'messaging_message_attachments' => 'messaging.message_attachments',
        'messaging_contact_flags' => 'messaging.contact_flags',
        'messaging_thread_reports' => 'messaging.thread_reports',
        'messaging_read_state' => 'messaging.read_state',
        'messaging_contact_blocks' => 'messaging.contact_blocks',
    ];

    /** @var list<string> */
    public const APPEND_ONLY_TABLES = [
        'messaging_messages',
        'messaging_message_attachments',
        'messaging_contact_flags',
        'messaging_thread_reports',
    ];

    /** @var array<string, list<string>> table => index definitions (columns joined with +) */
    public const UNIQUE_INDEXES = [
        'messaging_threads' => ['context_key+buyer_id+seller_id'],
        'messaging_messages' => [
            'thread_id+sequence',
            'thread_id+sender_id+client_message_id',
            'supersedes_id',
        ],
        'messaging_message_attachments' => ['message_id+media_id', 'message_id+position'],
        'messaging_contact_flags' => ['message_id+rule_id'],
        'messaging_read_state' => ['thread_id+reader_id+device_id'],
        'messaging_contact_blocks' => ['source_event_id', 'release_event_id'],
    ];

    /**
     * Named decisions, by PostgreSQL constraint name. Column hygiene stays inline
     * in the migration; the rows a reviewer would quote in a dispute are named.
     *
     * @var array<string, list<string>>
     */
    public const ROW_CHECKS = [
        'messaging.threads' => [
            'thread_has_two_different_parties',
            'thread_has_a_context',
            'thread_status_is_known',
            'a_closed_thread_states_when_and_why',
            'an_open_thread_has_no_close_time',
            'thread_version_starts_positive',
            'thread_message_count_is_not_negative',
        ],
        'messaging.messages' => [
            'message_kind_is_known',
            'message_sequence_is_positive',
            'a_tombstone_has_no_body',
            'a_live_version_has_a_body',
            'body_digest_is_sha256',
            'a_version_does_not_supersede_itself',
            'only_the_first_version_has_no_parent',
        ],
        'messaging.message_attachments' => [
            'attachment_kind_is_known',
            'attachment_position_is_bounded',
            'media_reference_is_not_a_path',
        ],
        'messaging.contact_flags' => [
            'flag_category_is_known',
            'flag_risk_is_known',
            'flag_confidence_is_pattern_only',
            'flag_rule_id_is_snake_case',
        ],
        'messaging.thread_reports' => [
            'report_reason_is_known',
            'an_other_report_states_what_happened',
        ],
        'messaging.read_state' => [
            'read_cursor_is_not_negative',
            'read_version_starts_positive',
        ],
        'messaging.contact_blocks' => [
            'a_block_is_not_self',
            'a_block_records_a_reason',
            'a_released_block_states_when',
        ],
    ];

    /**
     * Rules that span rows or depend on TG_OP, and so cannot be a CHECK. Listed so
     * the parity test requires each trigger to exist.
     *
     * @var array<string, list<string>>
     */
    public const TRIGGER_RULES = [
        'messaging_threads' => ['messaging_threads_version_monotonic'],
        'messaging_messages' => ['messaging_messages_append_only'],
        'messaging_message_attachments' => ['messaging_attachments_append_only'],
        'messaging_contact_flags' => ['messaging_flags_append_only'],
        'messaging_thread_reports' => ['messaging_reports_append_only'],
        'messaging_read_state' => ['messaging_read_state_version_monotonic'],
    ];

    public const SCHEMA = 'messaging';

    /**
     * Merge with SharedKernel's lists rather than replacing them: the store takes
     * whole-store lists, and a module that applied only its own would strip the
     * ledger's append-only rule.
     */
    public static function apply(InMemoryStore $store): void
    {
        $store->enforceAppendOnly(array_values(array_unique([
            ...self::APPEND_ONLY_TABLES,
            ...SharedSchema::APPEND_ONLY_TABLES,
        ])));

        $unique = SharedSchema::UNIQUE_INDEXES;
        foreach (self::UNIQUE_INDEXES as $table => $indexes) {
            $unique[$table] = array_values(array_unique([
                ...($unique[$table] ?? []),
                ...$indexes,
            ]));
        }
        $store->enforceUnique($unique);
    }

    private function __construct()
    {
    }
}
