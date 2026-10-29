<?php

declare(strict_types=1);

namespace NasTech\Tests\Notifications;

use NasTech\Notifications\DeliveryStatus;
use NasTech\Notifications\NotificationChannel;
use NasTech\Notifications\NotificationKind;
use NasTech\Notifications\Schema;
use NasTech\Tests\Notifications\Support\NotificationFixture;
use NasTech\Tests\Support\DdlRowChecks;
use NasTech\Tests\TestCase;

/**
 * 010_notifications.sql and Schema.php cannot be allowed to drift.
 *
 * There is no PostgreSQL here, so the migration is unexecuted. These tests read
 * it as text, compare both directions against the PHP model, run every named
 * CHECK against the rows a real Notifications path writes, and then break each
 * row on purpose to prove the CHECK actually says no. A check that exists but
 * never rejects is indistinguishable from no check at all until a notification
 * carries something it should not.
 */
final class NotificationDdlTest extends TestCase
{
    /** @var array<string, list<array<string,mixed>>>|null */
    private ?array $writtenRows = null;

    public function testEveryModelTableIsCreatedAndTheDdlInventsNoTable(): void
    {
        $tables = $this->ddlTables();

        foreach (Schema::TABLES as $phpName => $sqlName) {
            $this->assertTrue(isset($tables[$sqlName]), "{$phpName} ({$sqlName}) is not created by 010");
        }
        $this->assertSame(
            count(Schema::TABLES),
            count($tables),
            'the migration creates a table Schema::TABLES does not know',
        );
    }

    public function testEveryColumnTheModuleWritesExistsAndNoRequiredColumnIsMissed(): void
    {
        $tables = $this->ddlTables();
        $rows = $this->writtenRows();

        foreach (array_keys(Schema::TABLES) as $table) {
            $sqlName = Schema::TABLES[$table];
            $this->assertTrue(count($rows[$table] ?? []) > 0, "{$sqlName} has no row from a real Notifications path");

            foreach ($rows[$table] as $row) {
                foreach (array_keys($row) as $column) {
                    $this->assertTrue(
                        isset($tables[$sqlName]['columns'][$column]),
                        "{$sqlName}.{$column} is written but absent from the migration",
                    );
                }
            }

            foreach ($tables[$sqlName]['columns'] as $name => $detail) {
                if (!$detail['not_null'] || $detail['has_default']) {
                    continue;
                }
                $written = false;
                foreach ($rows[$table] as $row) {
                    if (array_key_exists($name, $row)) {
                        $written = true;
                        break;
                    }
                }
                $this->assertTrue(
                    $written,
                    "{$sqlName}.{$name} is NOT NULL with no default but no Notifications path writes it",
                );
            }
        }
    }

    public function testTheNotificationTableHasNoPersonalDataColumn(): void
    {
        $columns = $this->ddlTables()[Schema::TABLES['notification_notifications']]['columns'];

        foreach (['phone', 'phone_number', 'mobile', 'email', 'email_address', 'address', 'body', 'message_body', 'dispute_body', 'case_details'] as $forbidden) {
            $this->assertFalse(isset($columns[$forbidden]), "notifications.notifications gained a {$forbidden} column");
        }
    }

    public function testEveryAppendOnlyTableIsLockedByADeleteAndUpdateTrigger(): void
    {
        $locked = $this->appendOnlyTriggerTables();

        foreach (Schema::APPEND_ONLY_TABLES as $table) {
            $sqlName = Schema::TABLES[$table];
            $this->assertTrue(
                in_array($sqlName, $locked, true),
                "{$sqlName} is append-only in the model but 010 declares no BEFORE UPDATE OR DELETE trigger",
            );
        }
        foreach ($locked as $sqlName) {
            $phpName = array_search($sqlName, Schema::TABLES, true);
            $this->assertTrue(
                $phpName !== false && in_array($phpName, Schema::APPEND_ONLY_TABLES, true),
                "{$sqlName} has an append-only trigger but is not in Schema::APPEND_ONLY_TABLES",
            );
        }
    }

    public function testTheNamedTriggerRulesExist(): void
    {
        $ddl = $this->migration();
        foreach (Schema::TRIGGER_RULES as $table => $triggers) {
            $this->assertTrue(isset(Schema::TABLES[$table]), "TRIGGER_RULES names unknown table {$table}");
            foreach ($triggers as $trigger) {
                $this->assertStringContains(
                    'CREATE TRIGGER ' . $trigger,
                    $ddl,
                    "{$trigger} is required by Schema::TRIGGER_RULES but absent from 010",
                );
            }
        }
    }

    public function testEveryUniqueIndexExistsInBothDirections(): void
    {
        $declared = $this->uniqueIndexesInDdl();

        foreach (Schema::UNIQUE_INDEXES as $table => $definitions) {
            $sqlName = Schema::TABLES[$table];
            foreach ($definitions as $definition) {
                $columns = explode('+', $definition);
                $this->assertTrue(
                    in_array($columns, $declared[$sqlName] ?? [], true),
                    "UNIQUE ({$definition}) on {$sqlName} is enforced in memory but not declared in 010",
                );
            }
        }

        $expected = 0;
        foreach (Schema::UNIQUE_INDEXES as $definitions) {
            $expected += count($definitions);
        }
        $actual = 0;
        foreach ($declared as $indexes) {
            $actual += count($indexes);
        }
        $this->assertSame($expected, $actual, '010 declares a unique index the model does not enforce');
    }

    public function testEveryNamedRowCheckIsDeclaredAndNoExtraOneExists(): void
    {
        $ddl = $this->migration();

        foreach (Schema::TABLES as $table => $sqlName) {
            $declaredNames = array_column(DdlRowChecks::checksIn($ddl, $sqlName), 'name');
            $expected = Schema::ROW_CHECKS[$sqlName] ?? [];

            foreach ($expected as $constraint) {
                $this->assertTrue(
                    in_array($constraint, $declaredNames, true),
                    "{$sqlName}.{$constraint} is required by Schema::ROW_CHECKS but 010 no longer declares it",
                );
            }
            $this->assertSame(
                [],
                array_values(array_diff($declaredNames, $expected)),
                "{$sqlName} declares a named CHECK that Schema::ROW_CHECKS does not list",
            );
        }
    }

    public function testEveryRowARealPathWritesSatisfiesEveryCheckOnItsTable(): void
    {
        $ddl = $this->migration();
        $rows = $this->writtenRows();

        foreach (Schema::TABLES as $table => $sqlName) {
            $checks = DdlRowChecks::checksIn($ddl, $sqlName);
            $this->assertTrue($checks !== [], "{$sqlName} declares no row-level CHECK at all");

            foreach ($rows[$table] as $index => $row) {
                foreach ($checks as $check) {
                    $this->assertTrue(
                        DdlRowChecks::passes($check['expression'], $row),
                        sprintf('%s.%s rejects the real row %d: %s', $sqlName, $check['name'], $index, self::describe($row)),
                    );
                }
            }
        }
    }

    public function testEveryNotificationCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('notification_notifications');

        $this->assertCheckRejects('notification_notifications', array_merge($row, ['kind' => 'EMAIL_DIGEST']), 'notification_kind_is_known', 'an invented kind');
        $this->assertCheckRejects('notification_notifications', array_merge($row, ['source_module' => 'Nowhere']), 'notification_source_is_known', 'an invented source');
        $this->assertCheckRejects('notification_notifications', array_merge($row, ['subject_type' => 'profile']), 'notification_subject_type_is_known', 'an invented subject type');
        $this->assertCheckRejects('notification_notifications', array_merge($row, ['source_module' => 'Orders']), 'notification_kind_matches_its_source', 'a kind filed against the wrong module');
        $this->assertCheckRejects('notification_notifications', array_merge($row, ['source_event_id' => 'evt with space']), 'source_event_is_an_opaque_id', 'a non-opaque event id');
        $this->assertCheckRejects('notification_notifications', array_merge($row, ['recipient_id' => 'buyer@example.co.za']), 'recipient_is_an_opaque_account', 'an email address as an account');
        $this->assertCheckRejects('notification_notifications', array_merge($row, ['subject_id' => '082 123 4567']), 'subject_is_an_opaque_id', 'a phone number as a subject id');
        $this->assertCheckRejects('notification_notifications', array_merge($row, ['read_at' => '2026-10-22T08:00:00+00:00']), 'read_does_not_precede_creation', 'a read before creation');
    }

    public function testEveryAttemptCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('notification_delivery_attempts');

        $this->assertCheckRejects('notification_delivery_attempts', array_merge($row, ['channel' => 'FAX']), 'attempt_channel_is_known', 'an invented channel');
        $this->assertCheckRejects('notification_delivery_attempts', array_merge($row, ['attempt_no' => 0]), 'attempt_number_starts_positive', 'attempt zero');
        $this->assertCheckRejects('notification_delivery_attempts', array_merge($row, ['status' => 'PENDING']), 'attempt_status_is_known', 'an invented status');
    }

    public function testAnAttemptCannotReferenceAMissingNotification(): void
    {
        $ddl = $this->migration();

        $this->assertStringContains(
            'REFERENCES notifications.notifications (id)',
            $ddl,
            'the delivery-attempt table must require a notification in the DDL, not only in the service',
        );
    }

    public function testTheAppRoleCanReadAppendEvidenceButNotAlterItOrDeleteIt(): void
    {
        $grants = $this->grantsTo('nastech_app');
        $ddl = $this->migration();

        $notificationPrivileges = $grants['notifications.notifications'] ?? '';
        $this->assertStringContains('SELECT', $notificationPrivileges, 'notifications must be readable');
        $this->assertStringContains('INSERT', $notificationPrivileges, 'notifications must be appendable');
        $this->assertStringContains('UPDATE', $notificationPrivileges, 'read_at must stay updatable');
        $this->assertFalse(str_contains($notificationPrivileges, 'DELETE'), 'notifications must not be deletable');

        $attemptPrivileges = $grants['notifications.delivery_attempts'] ?? '';
        $this->assertStringContains('SELECT', $attemptPrivileges, 'delivery attempts must be readable');
        $this->assertStringContains('INSERT', $attemptPrivileges, 'delivery attempts must be appendable');
        $this->assertFalse(str_contains($attemptPrivileges, 'UPDATE'), 'delivery attempts are append-only but UPDATE is granted');
        $this->assertFalse(str_contains($attemptPrivileges, 'DELETE'), 'delivery attempts are append-only but DELETE is granted');

        foreach ($grants as $table => $privileges) {
            $this->assertFalse(str_contains($privileges, 'TRUNCATE'), "{$table} grants TRUNCATE to the app role");
            $this->assertFalse(str_contains($privileges, 'ALL'), "{$table} grants ALL to the app role");
        }

        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*DELETE[^;]*TO\s+nastech_app/s', $ddl),
            'the migration grants DELETE to the application role',
        );
    }

    public function testTheOwnerCanReadButNotRewriteEvidence(): void
    {
        $ddl = $this->migration();

        $this->assertStringContains(
            'GRANT SELECT ON ALL TABLES IN SCHEMA notifications TO nastech_owner',
            $ddl,
            'the owner role must be able to report over notification tables',
        );
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*UPDATE[^;]*TO\s+nastech_owner/s', $ddl),
            'the owner role must not rewrite any notification row',
        );
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*DELETE[^;]*TO\s+nastech_owner/s', $ddl),
            'the owner role must not delete any notification row',
        );
    }

    public function testTheMigrationUsesNoNonPostgresTriggerOwnershipStatement(): void
    {
        $this->assertFalse(
            str_contains($this->migration(), 'ALTER TRIGGER'),
            'ALTER TRIGGER ... OWNER TO is not PostgreSQL; the migration must not emit it',
        );
    }

    public function testTheMigrationRunsInOneTransactionAfter009(): void
    {
        $ddl = $this->migration();

        $this->assertStringContains('BEGIN;', $ddl);
        $this->assertStringContains('COMMIT;', $ddl);
        $this->assertTrue(
            file_exists(dirname(__DIR__, 2) . '/db/migrations/009_messaging.sql'),
            '010 is numbered to apply after 009',
        );
    }

    // ------------------------------------------------------------------
    // The path that touches every table
    // ------------------------------------------------------------------

    /**
     * @return array<string, list<array<string,mixed>>>
     */
    private function writtenRows(): array
    {
        if ($this->writtenRows !== null) {
            return $this->writtenRows;
        }

        $fx = new NotificationFixture();
        $message = $fx->record('evt_ddl_1', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_ddl_1');
        // A replay: it must not add a second notification.
        $fx->record('evt_ddl_1', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_ddl_1');
        $order = $fx->record('evt_ddl_2', 'acc_seller', 'ORDER_COMPLETED', 'ord_ddl_1');

        $fx->attempt($message->id, NotificationChannel::IN_APP, 1, DeliveryStatus::SENT);
        $fx->attempt($message->id, NotificationChannel::IN_APP, 2, DeliveryStatus::FAILED);
        $fx->attempt($order->id, NotificationChannel::EMAIL, 1, DeliveryStatus::QUEUED);

        $fx->advance('PT5M');
        $fx->service->markRead($message->id);

        $captured = [];
        foreach (array_keys(Schema::TABLES) as $table) {
            $captured[$table] = $fx->store->all($table);
        }

        return $this->writtenRows = $captured;
    }

    // ------------------------------------------------------------------
    // The DDL, read as text
    // ------------------------------------------------------------------

    /**
     * @return array<string, array{columns: array<string, array{not_null:bool, has_default:bool}>}>
     */
    private function ddlTables(): array
    {
        preg_match_all('/CREATE TABLE ([a-z_]+\.[a-z_]+) \((.*?)\n\);/s', $this->migration(), $matches, PREG_SET_ORDER);

        $tables = [];
        foreach ($matches as [$_, $name, $body]) {
            // Everything from the first CONSTRAINT onwards is table rules, not
            // columns. Without this cut a wrapped CHECK line beginning with "OR"
            // would be read as a column named "or".
            $columnSection = preg_split('/\n\s*CONSTRAINT\s+/', $body)[0] ?? $body;
            $columns = [];
            foreach (preg_split('/\r?\n/', $columnSection) as $line) {
                $line = trim($line);
                if ($line === '' || preg_match('/^(CONSTRAINT|CHECK|PRIMARY KEY|UNIQUE|FOREIGN|EXCLUDE)\b/i', $line)) {
                    continue;
                }
                if (preg_match('/^([a-z_]+)\s+\S/i', $line, $m) !== 1) {
                    continue;
                }
                $columns[$m[1]] = [
                    'not_null' => (bool) preg_match('/\bNOT NULL\b/i', $line),
                    'has_default' => (bool) preg_match('/\bDEFAULT\b/i', $line),
                ];
            }
            $tables[$name] = ['columns' => $columns];
        }

        return $tables;
    }

    /** @return list<string> */
    private function appendOnlyTriggerTables(): array
    {
        preg_match_all(
            '/CREATE TRIGGER\s+\w+\s+BEFORE UPDATE OR DELETE ON\s+([a-z_]+\.[a-z_]+)/',
            $this->migration(),
            $matches,
        );

        return $matches[1];
    }

    /** @return array<string, list<list<string>>> */
    private function uniqueIndexesInDdl(): array
    {
        preg_match_all(
            '/CREATE UNIQUE INDEX\s+\w+\s+ON\s+([a-z_]+\.[a-z_]+)\s*\(([^)]*)\)/',
            $this->migration(),
            $matches,
            PREG_SET_ORDER,
        );

        $indexes = [];
        foreach ($matches as [$_, $table, $columnList]) {
            $indexes[$table][] = array_map(
                static fn (string $c): string => trim(strtolower(trim($c))),
                explode(',', $columnList),
            );
        }

        return $indexes;
    }

    /** @return array<string, string> */
    private function grantsTo(string $role): array
    {
        $grants = [];
        preg_match_all(
            '/GRANT\s+([^;]+?)\s+ON\s+([^;]+?)\s+TO\s+' . preg_quote($role, '/') . '\s*;/s',
            $this->migration(),
            $matches,
            PREG_SET_ORDER,
        );

        foreach ($matches as [$_, $privileges, $tableList]) {
            foreach (preg_split('/,\s*/', preg_replace('/\s+/', ' ', trim($tableList))) as $table) {
                $table = trim($table);
                if (!str_contains($table, '.')) {
                    continue;
                }
                $grants[$table] = trim(strtoupper($privileges) . ' ' . ($grants[$table] ?? ''));
            }
        }

        return $grants;
    }

    /**
     * @param array<string,mixed> $row
     */
    private function assertCheckRejects(string $table, array $row, string $constraint, string $why): void
    {
        $sqlName = Schema::TABLES[$table] ?? $table;
        $expression = null;
        foreach (DdlRowChecks::checksIn($this->migration(), $sqlName) as $check) {
            if ($check['name'] === $constraint) {
                $expression = $check['expression'];
            }
        }
        $this->assertNotSame(null, $expression, "{$sqlName}.{$constraint} is missing");
        $this->assertFalse(
            DdlRowChecks::passes($expression, $row),
            "{$sqlName}.{$constraint} accepted {$why}",
        );
    }

    /**
     * @return array<string,mixed>
     */
    private function firstRow(string $table): array
    {
        $rows = $this->writtenRows()[$table] ?? [];

        return $rows[0] ?? throw new \RuntimeException('no row for ' . $table);
    }

    /**
     * @param array<string,mixed> $row
     */
    private static function describe(array $row): string
    {
        $parts = [];
        foreach ($row as $column => $value) {
            if ($value === null || is_scalar($value)) {
                $parts[] = $column . '=' . var_export($value, true);
            }
        }

        return implode(' ', $parts);
    }

    private function migration(): string
    {
        $path = dirname(__DIR__, 2) . '/db/migrations/010_notifications.sql';
        $contents = @file_get_contents($path);
        if ($contents === false) {
            $this->fail('migration is missing: ' . $path);
        }

        return $contents;
    }
}
