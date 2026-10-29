<?php

declare(strict_types=1);

namespace NasTech\Tests\Safety;

use NasTech\Safety\ReportReason;
use NasTech\Safety\ReportSubjectType;
use NasTech\Safety\SanctionAction;
use NasTech\Safety\SanctionDecision;
use NasTech\Safety\Schema;
use NasTech\Tests\Safety\Support\SafetyFixture;
use NasTech\Tests\Support\DdlRowChecks;
use NasTech\Tests\TestCase;

/**
 * 008_safety.sql and Schema.php cannot be allowed to drift.
 *
 * There is no PostgreSQL here, so the migration is unexecuted. These tests read
 * it as text, compare both directions against the PHP model, run every named
 * CHECK against the rows a real Safety path writes, and then break each row on
 * purpose to prove the CHECK actually says no. A check that exists but never
 * rejects is indistinguishable from no check at all until a sanction is
 * appealed or a report body is read.
 */
final class SafetyDdlTest extends TestCase
{
    /** @var array<string, list<array<string,mixed>>>|null */
    private ?array $writtenRows = null;

    public function testEveryModelTableIsCreatedAndTheDdlInventsNoTable(): void
    {
        $tables = $this->ddlTables();

        foreach (Schema::TABLES as $phpName => $sqlName) {
            $this->assertTrue(isset($tables[$sqlName]), "{$phpName} ({$sqlName}) is not created by 008");
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
            $this->assertTrue(count($rows[$table] ?? []) > 0, "{$sqlName} has no row from a real Safety path");

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
                    "{$sqlName}.{$name} is NOT NULL with no default but no Safety path writes it",
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
                "{$sqlName} is append-only in the model but 008 declares no BEFORE UPDATE OR DELETE trigger",
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
                    "{$trigger} is required by Schema::TRIGGER_RULES but absent from 008",
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
                    "UNIQUE ({$definition}) on {$sqlName} is enforced in memory but not declared in 008",
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
        $this->assertSame($expected, $actual, '008 declares a unique index the model does not enforce');
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
                    "{$sqlName}.{$constraint} is required by Schema::ROW_CHECKS but 008 no longer declares it",
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

    public function testEveryReportCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('safety_reports');

        $this->assertCheckRejects('safety_reports', array_merge($row, ['reason' => 'FRAUD']), 'report_reason_is_known', 'an invented reason');
        $this->assertCheckRejects('safety_reports', array_merge($row, ['subject_type' => 'ORDER']), 'report_subject_is_known', 'an invented subject');
        $this->assertCheckRejects('safety_reports', array_merge($row, ['state' => 'CLOSED']), 'report_state_is_known', 'an invented report state');
        $this->assertCheckRejects('safety_reports', array_merge($row, ['reported_account_id' => $row['reporter_id']]), 'a_report_is_not_about_its_author', 'a self-report');
        $this->assertCheckRejects('safety_reports', array_merge($row, ['subject_id' => '   ']), 'a_report_names_its_subject', 'a blank subject');
        $this->assertCheckRejects('safety_reports', array_merge($row, ['body' => '   ']), 'report_body_is_readable', 'an empty body');
        $this->assertCheckRejects('safety_reports', array_merge($row, ['body' => 'Identity 9001015800087']), 'report_body_has_no_identifier_number', 'an SA ID in the body');
        $this->assertCheckRejects('safety_reports', array_merge($row, ['body' => 'Call 082 123 4567']), 'report_body_has_no_phone_number', 'a phone number in the body');
        $this->assertCheckRejects('safety_reports', array_merge($row, ['version' => 0]), 'report_version_starts_positive', 'version zero');
    }

    public function testEveryBlockCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('safety_blocks');

        $this->assertCheckRejects('safety_blocks', array_merge($row, ['blocked_id' => $row['blocker_id']]), 'a_block_is_not_self', 'a self block');
        $this->assertCheckRejects('safety_blocks', array_merge($row, ['reason' => '   ']), 'a_block_records_a_reason', 'a blank reason');
        $this->assertCheckRejects('safety_blocks', array_merge($row, ['blocker_id' => '   ']), 'a_block_names_both_parties', 'a blank blocker');
    }

    public function testEverySanctionCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $appliedWarning = $this->rowWhere('safety_sanctions', static fn (array $r): bool => $r['action'] === 'WARNING');
        $proposed = $this->rowWhere('safety_sanctions', static fn (array $r): bool => $r['state'] === 'PROPOSED');
        $appliedBan = $this->rowWhere('safety_sanctions', static fn (array $r): bool => $r['action'] === 'BAN' && $r['state'] === 'APPLIED');

        $this->assertCheckRejects('safety_sanctions', array_merge($appliedWarning, ['action' => 'MUTE']), 'sanction_action_is_known', 'an invented action');
        $this->assertCheckRejects('safety_sanctions', array_merge($appliedWarning, ['state' => 'REJECTED']), 'sanction_state_is_known', 'an invented state');
        $this->assertCheckRejects('safety_sanctions', array_merge($appliedWarning, ['reason' => '   ']), 'a_sanction_records_a_reason', 'a blank reason');
        $this->assertCheckRejects('safety_sanctions', array_merge($appliedWarning, ['target_account_id' => '   ']), 'a_sanction_names_its_target_and_maker', 'a blank target');
        $this->assertCheckRejects('safety_sanctions', array_merge($appliedWarning, ['expires_at' => $appliedWarning['created_at']]), 'sanction_expiry_is_after_it_was_raised', 'an expiry equal to creation');
        $this->assertCheckRejects('safety_sanctions', array_merge($proposed, ['checker_id' => 'acc_staff_two']), 'a_proposed_sanction_awaits_a_second_actor', 'a proposal with a checker');
        $this->assertCheckRejects('safety_sanctions', array_merge($appliedBan, ['decided_at' => null]), 'an_applied_sanction_says_when', 'an applied ban with no decision time');
        $this->assertCheckRejects('safety_sanctions', array_merge($appliedBan, ['checker_id' => $appliedBan['maker_id']]), 'a_sanction_is_not_self_checked', 'a maker checking their own ban');
        $this->assertCheckRejects('safety_sanctions', array_merge($appliedWarning, ['checker_id' => 'acc_staff_two']), 'a_warning_needs_one_actor_and_a_restraint_needs_two', 'a warning with a checker');
        $this->assertCheckRejects('safety_sanctions', array_merge($appliedBan, ['checker_id' => null]), 'a_warning_needs_one_actor_and_a_restraint_needs_two', 'a ban applied by one actor');
        $this->assertCheckRejects('safety_sanctions', array_merge($appliedBan, ['version' => 0]), 'sanction_version_starts_positive', 'version zero');
    }

    public function testEveryDecisionCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('safety_sanction_decisions');
        $proposed = $this->rowWhere('safety_sanction_decisions', static fn (array $r): bool => $r['decision'] === 'PROPOSED');

        $this->assertCheckRejects('safety_sanction_decisions', array_merge($row, ['decision' => 'ESCALATED']), 'decision_is_known', 'an invented decision');
        $this->assertCheckRejects('safety_sanction_decisions', array_merge($row, ['actor_role' => 'OWNER']), 'decision_actor_role_is_known', 'an invented actor role');
        $this->assertCheckRejects('safety_sanction_decisions', array_merge($proposed, ['actor_role' => 'CHECKER']), 'a_decision_names_the_role_that_made_it', 'a proposal attributed to a checker');
        $this->assertCheckRejects('safety_sanction_decisions', array_merge($row, ['reason' => '   ']), 'a_decision_records_a_reason', 'a blank reason');
        $this->assertCheckRejects('safety_sanction_decisions', array_merge($row, ['actor_id' => '   ']), 'a_decision_names_its_actor', 'a blank actor');
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

        foreach (['safety.reports', 'safety.sanctions'] as $mutable) {
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
            'GRANT SELECT ON ALL TABLES IN SCHEMA safety TO nastech_owner',
            $ddl,
            'the owner role must be able to report over safety tables',
        );
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*UPDATE[^;]*TO\s+nastech_owner/s', $ddl),
            'the owner role must not rewrite any safety row',
        );
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*DELETE[^;]*TO\s+nastech_owner/s', $ddl),
            'the owner role must not delete any safety row',
        );
    }

    public function testTheMigrationIsOneTransactionOnItsOwnSchema(): void
    {
        $ddl = $this->migration();

        $this->assertStringContains('BEGIN;', $ddl);
        $this->assertStringContains('CREATE SCHEMA safety;', $ddl);
        $this->assertStringContains('COMMIT;', $ddl);
        $this->assertFalse(str_contains($ddl, 'ALTER TRIGGER'), 'a trigger has no owner of its own');
        $this->assertFalse(
            (bool) preg_match('/\bCONSTANT\b/', $ddl),
            'no PL/pgSQL variable is declared CONSTANT and then reassigned',
        );
    }

    public function testTheClosedVocabulariesAppearInTheDdl(): void
    {
        $ddl = $this->migration();

        foreach (ReportReason::ALL as $reason) {
            $this->assertStringContains("'{$reason}'", $ddl, "report reason {$reason} is absent from 008");
        }
        foreach (ReportSubjectType::ALL as $subject) {
            $this->assertStringContains("'{$subject}'", $ddl, "report subject {$subject} is absent from 008");
        }
        foreach (SanctionAction::ALL as $action) {
            $this->assertStringContains("'{$action}'", $ddl, "sanction action {$action} is absent from 008");
        }
        foreach (SanctionDecision::DECISIONS as $decision) {
            $this->assertStringContains("'{$decision}'", $ddl, "sanction decision {$decision} is absent from 008");
        }
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

        $fx = new SafetyFixture();
        $expiry = $fx->futureExpiry();

        $fx->service->fileReport(
            $fx->reporter->id,
            ReportSubjectType::SELLER,
            $fx->reported->id,
            $fx->reported->id,
            ReportReason::SCAM,
            'The seller demanded an EFT outside the app after I refused.',
        );
        $fx->service->block($fx->reporter->id, $fx->reported->id, 'Repeated pressure after the sale');

        $fx->service->requestSanction(
            $fx->staff->id,
            $fx->reported->id,
            SanctionAction::WARNING,
            'First warning for off-platform payment pressure',
            $expiry,
        );

        $ban = $fx->service->requestSanction(
            $fx->staff->id,
            $fx->stranger->id,
            SanctionAction::BAN,
            'Fraud confirmed by two buyers',
            $expiry,
        );
        $fx->service->approveSanction($fx->staffTwo->id, $ban->id);

        // A second restraint that stays proposed: the DDL distinguishes both
        // shapes, so the row fixture must contain both.
        $fx->service->requestSanction(
            $fx->staff->id,
            $fx->stranger->id,
            SanctionAction::SUSPEND,
            'Abusive conduct under review',
            $fx->futureExpiry('P7D'),
        );

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
        $path = Schema::migrationPath();
        $contents = @file_get_contents($path);
        if ($contents === false) {
            $this->fail('migration is missing: ' . $path);
        }

        return $contents;
    }
}
