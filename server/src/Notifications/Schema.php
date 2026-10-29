<?php

declare(strict_types=1);

namespace NasTech\Notifications;

use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Schema as SharedSchema;

/**
 * Notifications' constraints, as data.
 *
 * 010_notifications.sql declares the same lists. NotificationDdlTest compares
 * them in both directions and evaluates every named CHECK against the rows the
 * module actually writes, so a rule here that production does not enforce — or
 * a rule there that the in-memory model cannot exercise — fails the build.
 *
 * The load-bearing entries:
 *   - (source_event_id, recipient_id, kind) is unique: a replayed event is one
 *     notification, not two.
 *   - delivery_attempts is append-only: a failed attempt is answered by the next
 *     attempt number, never by editing the old row.
 *   - (notification_id, channel, attempt_no) is unique: a retried worker run
 *     cannot double-send.
 *   - read_at is null or not earlier than created_at: a row cannot claim it was
 *     read before it existed.
 */
final class Schema
{
    /**
     * @var array<string, string> bare table => "schema.table"
     */
    public const TABLES = [
        'notification_notifications' => 'notifications.notifications',
        'notification_delivery_attempts' => 'notifications.delivery_attempts',
    ];

    /** @var list<string> */
    public const APPEND_ONLY_TABLES = [
        'notification_delivery_attempts',
    ];

    /** @var array<string, list<string>> table => index definitions (columns joined with +) */
    public const UNIQUE_INDEXES = [
        'notification_notifications' => ['source_event_id+recipient_id+kind'],
        'notification_delivery_attempts' => ['notification_id+channel+attempt_no'],
    ];

    /**
     * Named row rules, mirrored by CONSTRAINT names in 010. Column hygiene that
     * is not a decision (NOT NULL, DEFAULT now()) stays inline in the migration.
     *
     * @var array<string, list<string>>
     */
    public const ROW_CHECKS = [
        'notifications.notifications' => [
            'notification_kind_is_known',
            'notification_source_is_known',
            'notification_subject_type_is_known',
            'notification_kind_matches_its_source',
            'source_event_is_an_opaque_id',
            'recipient_is_an_opaque_account',
            'subject_is_an_opaque_id',
            'read_does_not_precede_creation',
        ],
        'notifications.delivery_attempts' => [
            'attempt_channel_is_known',
            'attempt_number_starts_positive',
            'attempt_status_is_known',
        ],
    ];

    /**
     * Rules that need a trigger rather than a CHECK. Listed so the parity test
     * requires each trigger to exist.
     *
     * @var array<string, list<string>>
     */
    public const TRIGGER_RULES = [
        'notification_delivery_attempts' => ['notification_attempts_append_only'],
    ];

    public const SCHEMA = 'notifications';

    /**
     * Merge with SharedKernel's lists rather than replacing them: the store
     * takes whole-store lists, and a module that applied only its own would
     * strip the ledger's append-only rule.
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
