<?php

declare(strict_types=1);

namespace NasTech\Tests\Messaging;

use NasTech\Messaging\Schema;
use NasTech\Messaging\ThreadReportReason;
use NasTech\Tests\Messaging\Support\MessagingFixture;
use NasTech\Tests\Support\DdlRowChecks;
use NasTech\Tests\TestCase;

/**
 * 009_messaging.sql and Schema.php cannot be allowed to drift.
 *
 * There is no PostgreSQL here, so the migration is unexecuted. These tests read it
 * as text, compare both directions against the PHP model, run every named CHECK
 * against the rows a real Messaging path writes, and then break each row on purpose
 * to prove the CHECK actually says no. A check that exists but never rejects is
 * indistinguishable from no check at all until a dispute reads the row.
 */
final class MessagingDdlTest extends TestCase
{
    /** @var array<string, list<array<string,mixed>>>|null */
    private ?array $writtenRows = null;

    public function testEveryModelTableIsCreatedAndTheDdlInventsNoTable(): void
    {
        $tables = $this->ddlTables();

        foreach (Schema::TABLES as $phpName => $sqlName) {
            $this->assertTrue(isset($tables[$sqlName]), "{$phpName} ({$sqlName}) is not created by 009");
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
            $this->assertTrue(count($rows[$table] ?? []) > 0, "{$sqlName} has no row from a real Messaging path");

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
                    "{$sqlName}.{$name} is NOT NULL with no default but no Messaging path writes it",
                );
            }
        }
    }

    public function testEveryAppendOnlyTableIsLockedByADeleteAndUpdateTrigger(): void
    {
        $locked = $this->appendOnlyTriggerTables();

        foreach (Schema::APPEND_ONLY_TABLES as $table) {
            $sqlName = Schema::TABLES[$table];
            $this->assertTrue(
                in_array($sqlName, $locked, true),
                "{$sqlName} is append-only in the model but 009 declares no BEFORE UPDATE OR DELETE trigger",
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
                    "{$trigger} is required by Schema::TRIGGER_RULES but absent from 009",
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
                    "UNIQUE ({$definition}) on {$sqlName} is enforced in memory but not declared in 009",
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
        $this->assertSame($expected, $actual, '009 declares a unique index the model does not enforce');
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
                    "{$sqlName}.{$constraint} is required by Schema::ROW_CHECKS but 009 no longer declares it",
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

    public function testEveryThreadCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('messaging_threads');

        $this->assertCheckRejects('messaging_threads', array_merge($row, ['seller_id' => $row['buyer_id']]), 'thread_has_two_different_parties', 'same account on both sides');
        $this->assertCheckRejects('messaging_threads', array_merge($row, ['listing_id' => null, 'order_id' => null]), 'thread_has_a_context', 'a thread about nothing');
        $this->assertCheckRejects('messaging_threads', array_merge($row, ['status' => 'ARCHIVED']), 'thread_status_is_known', 'an invented status');
        $this->assertCheckRejects('messaging_threads', array_merge($row, ['status' => 'CLOSED', 'closed_at' => null, 'closed_reason' => 'DONE']), 'a_closed_thread_states_when_and_why', 'a closed thread with no close time');
        $this->assertCheckRejects('messaging_threads', array_merge($row, ['status' => 'OPEN', 'closed_at' => '2026-10-22T09:00:00+00:00']), 'an_open_thread_has_no_close_time', 'an open thread with a close time');
        $this->assertCheckRejects('messaging_threads', array_merge($row, ['version' => 0]), 'thread_version_starts_positive', 'version zero');
        $this->assertCheckRejects('messaging_threads', array_merge($row, ['message_count' => -1]), 'thread_message_count_is_not_negative', 'a negative count');
    }

    public function testEveryMessageCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $live = $this->rowWhere('messaging_messages', static fn (array $r): bool => $r['kind'] === 'MESSAGE');
        $tombstone = $this->rowWhere('messaging_messages', static fn (array $r): bool => $r['kind'] === 'TOMBSTONE');

        $this->assertCheckRejects('messaging_messages', array_merge($live, ['kind' => 'GIF']), 'message_kind_is_known', 'an invented kind');
        $this->assertCheckRejects('messaging_messages', array_merge($live, ['sequence' => 0]), 'message_sequence_is_positive', 'sequence zero');
        $this->assertCheckRejects('messaging_messages', array_merge($tombstone, ['body' => 'resurrected']), 'a_tombstone_has_no_body', 'a tombstone carrying text');
        $this->assertCheckRejects('messaging_messages', array_merge($live, ['body' => null]), 'a_live_version_has_a_body', 'a live version with no body');
        $this->assertCheckRejects('messaging_messages', array_merge($live, ['body_digest' => 'not-a-digest']), 'body_digest_is_sha256', 'a non-sha256 digest');
        $this->assertCheckRejects('messaging_messages', array_merge($live, ['supersedes_id' => $live['id']]), 'a_version_does_not_supersede_itself', 'a row superseding itself');
        $this->assertCheckRejects('messaging_messages', array_merge($live, ['supersedes_id' => 'msg_someone_else']), 'only_the_first_version_has_no_parent', 'a MESSAGE with a parent');
    }

    public function testEveryAttachmentCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('messaging_message_attachments');

        $this->assertCheckRejects('messaging_message_attachments', array_merge($row, ['kind' => 'AUDIO']), 'attachment_kind_is_known', 'an invented attachment kind');
        $this->assertCheckRejects('messaging_message_attachments', array_merge($row, ['position' => 4]), 'attachment_position_is_bounded', 'a fifth position');
        $this->assertCheckRejects('messaging_message_attachments', array_merge($row, ['media_id' => 'https://cdn.example/x.jpg']), 'media_reference_is_not_a_path', 'a URL stored as a media id');
    }

    public function testEveryFlagCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('messaging_contact_flags');

        $this->assertCheckRejects('messaging_contact_flags', array_merge($row, ['category' => 'SPAM']), 'flag_category_is_known', 'an invented category');
        $this->assertCheckRejects('messaging_contact_flags', array_merge($row, ['risk' => 'HIGH']), 'flag_risk_is_known', 'an invented risk');
        $this->assertCheckRejects('messaging_contact_flags', array_merge($row, ['confidence' => '0.87']), 'flag_confidence_is_pattern_only', 'a numeric confidence');
        $this->assertCheckRejects('messaging_contact_flags', array_merge($row, ['rule_id' => 'Bad Rule!']), 'flag_rule_id_is_snake_case', 'a rule id that is not snake_case');
    }

    public function testEveryReportCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('messaging_thread_reports');

        $this->assertCheckRejects('messaging_thread_reports', array_merge($row, ['reason' => 'FRAUD']), 'report_reason_is_known', 'an invented report reason');
        $this->assertCheckRejects('messaging_thread_reports', array_merge($row, ['reason' => 'OTHER', 'details' => null]), 'an_other_report_states_what_happened', 'an empty OTHER report');
    }

    public function testEveryReadStateCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('messaging_read_state');

        $this->assertCheckRejects('messaging_read_state', array_merge($row, ['last_read_sequence' => -1]), 'read_cursor_is_not_negative', 'a negative cursor');
        $this->assertCheckRejects('messaging_read_state', array_merge($row, ['version' => 0]), 'read_version_starts_positive', 'version zero');
    }

    public function testEveryBlockCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('messaging_contact_blocks');

        $this->assertCheckRejects('messaging_contact_blocks', array_merge($row, ['blocked_id' => $row['blocker_id']]), 'a_block_is_not_self', 'a self block');
        $this->assertCheckRejects('messaging_contact_blocks', array_merge($row, ['reason' => '   ']), 'a_block_records_a_reason', 'a blank reason');
        $this->assertCheckRejects('messaging_contact_blocks', array_merge($row, ['active' => false, 'released_at' => null]), 'a_released_block_states_when', 'an inactive block with no release time');
    }

    public function testTheAppRoleCanAppendEvidenceButNotAlterItOrDeleteIt(): void
    {
        $grants = $this->grantsTo('nastech_app');
        $ddl = $this->migration();

        foreach (Schema::APPEND_ONLY_TABLES as $table) {
            $sqlName = Schema::TABLES[$table];
            $privileges = $grants[$sqlName] ?? '';
            $this->assertStringContains('SELECT', $privileges, "{$sqlName} must be readable");
            $this->assertStringContains('INSERT', $privileges, "{$sqlName} must be appendable");
            $this->assertFalse(str_contains($privileges, 'UPDATE'), "{$sqlName} is append-only but UPDATE is granted");
            $this->assertFalse(str_contains($privileges, 'DELETE'), "{$sqlName} is append-only but DELETE is granted");
        }

        foreach (['messaging.threads', 'messaging.read_state', 'messaging.contact_blocks'] as $mutable) {
            $this->assertStringContains('UPDATE', $grants[$mutable] ?? '', "{$mutable} must stay updatable");
            $this->assertFalse(str_contains($grants[$mutable] ?? '', 'DELETE'), "{$mutable} must not be deletable");
        }

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
            'GRANT SELECT ON ALL TABLES IN SCHEMA messaging TO nastech_owner',
            $ddl,
            'the owner role must be able to report over messaging tables',
        );
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*UPDATE[^;]*TO\s+nastech_owner/s', $ddl),
            'the owner role must not rewrite any messaging row',
        );
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*DELETE[^;]*TO\s+nastech_owner/s', $ddl),
            'the owner role must not delete any messaging row',
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

        $fx = new MessagingFixture();
        $thread = $fx->openThread();
        $fx->service->sendMessage($thread->id, 'acc_buyer', 'Can we arrange a viewing?', 'clt_ddl_0001', [
            ['media_id' => 'med_ddl_1', 'kind' => 'PHOTO', 'position' => 0],
        ]);
        $flagged = $fx->service->sendMessage($thread->id, 'acc_buyer', 'Email me at buyer@example.co.za', 'clt_ddl_0002');
        $edit = $fx->service->editMessage($flagged->id, 'acc_buyer', 'Email me at buyer.one@example.co.za', 'clt_ddl_0003');
        $fx->service->deleteMessage($edit->id, 'acc_buyer', 'clt_ddl_0004');
        $fx->service->reportThread($thread->id, 'acc_seller', ThreadReportReason::OFF_PLATFORM_PRESSURE, null, 2);
        $fx->service->markRead($thread->id, 'acc_seller', 'device_ddl', 4, 0);
        $fx->service->closeThread($thread->id, 'acc_seller', 'DDL_PATH');

        // A released block and an active block: both shapes the CHECKs distinguish.
        $fx->service->applySafetyEvent('ContactBlocked', [
            'event_id' => 'evt_ddl_block_1',
            'blocker_id' => 'acc_seller',
            'blocked_id' => 'acc_buyer',
            'reason' => 'ddl path',
        ]);
        $fx->service->applySafetyEvent('ContactUnblocked', [
            'event_id' => 'evt_ddl_unblock_1',
            'blocker_id' => 'acc_seller',
            'blocked_id' => 'acc_buyer',
        ]);
        $fx->service->applySafetyEvent('ContactBlocked', [
            'event_id' => 'evt_ddl_block_2',
            'blocker_id' => 'acc_buyer',
            'blocked_id' => 'acc_stranger',
            'reason' => 'ddl path active',
        ]);

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
     * @param callable(array<string,mixed>): bool $predicate
     * @return array<string,mixed>
     */
    private function rowWhere(string $table, callable $predicate): array
    {
        foreach ($this->writtenRows()[$table] ?? [] as $row) {
            if ($predicate($row)) {
                return $row;
            }
        }

        throw new \RuntimeException('no matching row for ' . $table);
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
        $path = dirname(__DIR__, 2) . '/db/migrations/009_messaging.sql';
        $contents = @file_get_contents($path);
        if ($contents === false) {
            $this->fail('migration is missing: ' . $path);
        }

        return $contents;
    }
}
