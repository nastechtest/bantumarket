<?php

declare(strict_types=1);

namespace NasTech\Tests\Audit;

use NasTech\Audit\ActorKind;
use NasTech\Audit\Schema;
use NasTech\Audit\SecretGuard;
use NasTech\Tests\Support\DdlRowChecks;
use NasTech\Tests\TestCase;

/**
 * 012_audit.sql and src/Audit/Schema.php cannot be allowed to drift.
 *
 * No PostgreSQL server is reachable here, so the migration is unexecuted SQL. The
 * failure this file exists for is the one only production would show: an audit
 * table the application can UPDATE, a named CHECK missing from one side, a column
 * the writer populates that the DDL never creates, or a grant that makes the
 * append-only trigger decorative.
 *
 * The rows fed through the CHECKs are the rows the module really writes — one per
 * actor kind plus an impersonation — not hand-built fixtures that could agree with
 * a wrong constraint.
 */
final class AuditDdlTest extends TestCase
{
    /** @var list<array<string,mixed>>|null */
    private ?array $writtenRows = null;

    private string $sql;

    private string $path;

    public function setUp(): void
    {
        $this->path = dirname(__DIR__, 2) . '/db/migrations/012_audit.sql';
        $contents = @file_get_contents($this->path);
        if ($contents === false) {
            $this->fail('migration is missing: ' . $this->path);
        }
        $this->sql = $contents;
    }

    public function testTheDdlCreatesExactlyTheTablesTheModelKnows(): void
    {
        $created = $this->tablesInDdl();
        $expected = array_values(Schema::TABLES);

        sort($created);
        sort($expected);

        $this->assertSame($expected, $created);
    }

    public function testTheMigrationIsTransactionalAndIsNumberedAfter011(): void
    {
        $this->assertTrue((bool) preg_match('/^BEGIN;$/m', $this->sql), '012 must open a transaction');
        $this->assertTrue((bool) preg_match('/^COMMIT;$/m', $this->sql), '012 must close its transaction');
        $this->assertStringContains('CREATE SCHEMA audit;', $this->sql);
        $this->assertTrue(str_ends_with($this->path, '012_audit.sql'), 'this is the reserved 012 migration');
        $this->assertFalse((bool) preg_match('/^\s*(DROP|TRUNCATE)\b/im', $this->sql), 'a forward migration does not drop evidence');
    }

    public function testTheAppendOnlyTableCarriesAMutationTriggerAndNoTriggerOwnerIsReassigned(): void
    {
        $this->assertTrue(
            (bool) preg_match('/CREATE TRIGGER audit_log_append_only\s+BEFORE UPDATE OR DELETE ON audit\.audit_log/', $this->sql),
            'audit.audit_log must carry the append-only trigger',
        );
        $this->assertStringContains('shared.forbid_row_mutation()', $this->sql);

        $withoutComments = preg_replace('/--.*$/m', '', $this->sql) ?? '';
        $this->assertFalse(
            (bool) preg_match('/ALTER\s+TRIGGER\b/i', $withoutComments),
            'PostgreSQL has no ALTER TRIGGER ... OWNER TO; the trigger fires with the table owner',
        );
    }

    public function testEveryNamedCheckIsDeclaredAndNoExtraOneExists(): void
    {
        $declared = array_column(DdlRowChecks::checksIn($this->sql, 'audit.audit_log'), 'name');
        $expected = Schema::ROW_CHECKS['audit.audit_log'];

        foreach ($expected as $constraint) {
            $this->assertTrue(
                in_array($constraint, $declared, true),
                "{$constraint} is required by Schema::ROW_CHECKS but 012 does not declare it",
            );
        }

        $this->assertSame(
            [],
            array_values(array_diff($declared, $expected)),
            '012 declares a named CHECK that Schema::ROW_CHECKS does not list',
        );
    }

    public function testEveryRowARealPathWritesSatisfiesEveryCheckOnItsTable(): void
    {
        $checks = DdlRowChecks::checksIn($this->sql, 'audit.audit_log');
        $rows = $this->writtenRows();
        $this->assertCount(5, $rows);

        foreach ($rows as $index => $row) {
            foreach ($checks as $check) {
                $this->assertTrue(
                    DdlRowChecks::passes($check['expression'], $row),
                    sprintf(
                        'audit.audit_log.%s rejects the real row %d: %s',
                        $check['name'],
                        $index,
                        self::describe($row),
                    ),
                );
            }
        }
    }

    public function testEveryColumnWrittenExistsAndEveryRequiredColumnIsWritten(): void
    {
        $tables = $this->ddlTables();
        $sqlName = Schema::TABLES['audit_log'];
        $this->assertTrue(isset($tables[$sqlName]), '012 does not create ' . $sqlName);

        $rows = $this->writtenRows();

        foreach ($rows as $row) {
            foreach (array_keys($row) as $column) {
                $this->assertTrue(
                    isset($tables[$sqlName]['columns'][$column]),
                    "{$sqlName}.{$column} is written but absent from 012",
                );
            }
        }

        foreach ($tables[$sqlName]['columns'] as $name => $detail) {
            if (!$detail['not_null'] || $detail['has_default']) {
                continue;
            }
            $written = false;
            foreach ($rows as $row) {
                if (array_key_exists($name, $row)) {
                    $written = true;
                    break;
                }
            }
            $this->assertTrue(
                $written,
                "{$sqlName}.{$name} is NOT NULL with no default but the audit path never writes it",
            );
        }
    }

    public function testTheAppRoleCanAppendAndReadButNeverAlterDeleteOrTruncate(): void
    {
        $grants = $this->grantsTo('nastech_app');
        $privileges = $grants['audit.audit_log'] ?? '';

        $this->assertStringContains('SELECT', $privileges, 'the audit console reads under the app role');
        $this->assertStringContains('INSERT', $privileges, 'the sink appends under the app role');
        $this->assertFalse(str_contains($privileges, 'UPDATE'), 'audit.audit_log is append-only but UPDATE is granted');
        $this->assertFalse(str_contains($privileges, 'DELETE'), 'audit.audit_log is append-only but DELETE is granted');
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*\bDELETE\b[^;]*TO\s+nastech_app/s', $this->sql),
            'the migration grants DELETE to the application role',
        );
        $this->assertFalse((bool) preg_match('/GRANT[^;]*\bTRUNCATE\b/i', $this->sql), 'no role may truncate evidence');
        $this->assertFalse((bool) preg_match('/GRANT\s+ALL\b/i', $this->sql), 'no role receives ALL');
    }

    public function testTheOwnerCanReadAndAppendButNotRewriteEvidence(): void
    {
        $this->assertStringContains(
            'GRANT SELECT ON ALL TABLES IN SCHEMA audit TO nastech_owner',
            $this->sql,
        );
        $this->assertStringContains('GRANT INSERT ON audit.audit_log TO nastech_owner', $this->sql);
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*\bUPDATE\b[^;]*TO\s+nastech_owner/s', $this->sql),
            'the owner role must not rewrite an audit row',
        );
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*\bDELETE\b[^;]*TO\s+nastech_owner/s', $this->sql),
            'the owner role must not delete an audit row',
        );
    }

    public function testTheMigrationReadsNoOtherModulesSchema(): void
    {
        $withoutComments = preg_replace('/--.*$/m', '', $this->sql) ?? '';
        preg_match_all(
            '/\b(commissions|settlements|orders|payments|catalogue|identity|media|handover|payouts|messaging|reporting|edge)\./',
            $withoutComments,
            $matches,
        );

        $this->assertSame([], $matches[1], 'Audit has no outbound edges; rows arrive through SharedKernel AuditSink');
    }

    public function testNoStoredColumnNameIsOnTheSecretDenyList(): void
    {
        $columns = array_keys($this->ddlTables()['audit.audit_log']['columns']);
        $this->assertNotSame([], $columns);

        foreach ($columns as $column) {
            $this->assertFalse(
                SecretGuard::isDeniedFieldName($column),
                "audit.audit_log.{$column} is named like a secret; the audit log stores references, never secrets",
            );
        }
    }

    public function testTheActorKindCheckEnumeratesExactlyTheEnum(): void
    {
        $expression = $this->checkExpression('audit_actor_kind_is_known');
        $this->assertNotSame(null, $expression);

        preg_match_all("/'([a-z]+)'/", (string) $expression, $matches);

        $this->assertSame(ActorKind::values(), $matches[1]);
    }

    public function testEveryCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->writtenRows()[0];

        $this->assertCheckRejects(array_merge($row, ['actor_kind' => 'admin']), 'audit_actor_kind_is_known', 'an invented actor kind');
        $this->assertCheckRejects(array_merge($row, ['actor_kind' => 'staff', 'capability' => null]), 'audit_staff_names_capability', 'a staff action with no capability');
        $this->assertCheckRejects(array_merge($row, ['actor_kind' => 'buyer', 'impersonated_account_id' => 'acc_target']), 'audit_impersonation_is_staff_only', 'a buyer naming an impersonated account');
        $this->assertCheckRejects(array_merge($row, ['actor_kind' => 'staff', 'capability' => 'listing.review', 'actor_id' => 'acc_same', 'impersonated_account_id' => 'acc_same']), 'audit_impersonation_names_a_different_target', 'an impersonation of oneself');
        $this->assertCheckRejects(array_merge($row, ['actor_kind' => 'staff', 'capability' => 'listing.review', 'impersonated_account_id' => 'acc_target', 'subject_id' => null]), 'audit_impersonation_names_the_subject', 'an impersonation with no subject');
        $this->assertCheckRejects(array_merge($row, ['diff_bytes' => 9000]), 'audit_diff_is_bounded', 'a diff over the ceiling');
        $this->assertCheckRejects(array_merge($row, ['action' => 'Bad Action']), 'audit_action_is_dotted_lowercase', 'an action that is not a dotted lower-case verb');
        $this->assertCheckRejects(array_merge($row, ['target_id' => '   ']), 'audit_target_is_named', 'a blank target id');
        $this->assertCheckRejects(array_merge($row, ['actor_id' => '   ']), 'audit_actor_is_named', 'a blank actor id');
        $this->assertCheckRejects(array_merge($row, ['actor_role' => 'STAFF']), 'audit_actor_role_is_lowercase', 'an upper-case actor role');
        $this->assertCheckRejects(array_merge($row, ['request_id' => '']), 'audit_request_is_named', 'an empty request id');
        $this->assertCheckRejects(array_merge($row, ['capability' => 'Bad Cap']), 'audit_capability_is_dotted', 'a capability that is not a dotted verb');
        $this->assertCheckRejects(array_merge($row, ['reason' => str_repeat('x', 2001)]), 'audit_reason_is_bounded', 'a reason over the ceiling');
        $this->assertCheckRejects(array_merge($row, ['before_state' => '123']), 'audit_diff_is_a_json_document', 'a scalar diff');
    }

    // ------------------------------------------------------------------
    // Fixtures and the DDL, read as text
    // ------------------------------------------------------------------

    /**
     * @return list<array<string,mixed>>
     */
    private function writtenRows(): array
    {
        if ($this->writtenRows !== null) {
            return $this->writtenRows;
        }

        $fx = new AuditFixture();
        $fx->writeEveryActorKind();

        return $this->writtenRows = $fx->store->all('audit_log');
    }

    /**
     * @return list<string>
     */
    private function tablesInDdl(): array
    {
        preg_match_all('/CREATE TABLE (audit\.[a-z_]+)/', $this->sql, $matches);

        return $matches[1];
    }

    /**
     * @return array<string, array{columns: array<string, array{not_null: bool, has_default: bool}>}>
     */
    private function ddlTables(): array
    {
        preg_match_all('/CREATE TABLE ([a-z_]+\.[a-z_]+) \((.*?)\n\);/s', $this->sql, $matches, PREG_SET_ORDER);

        $tables = [];
        foreach ($matches as [, $name, $body]) {
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

    /**
     * @return array<string, string>
     */
    private function grantsTo(string $role): array
    {
        $grants = [];
        preg_match_all(
            '/GRANT\s+([^;]+?)\s+ON\s+([^;]+?)\s+TO\s+' . preg_quote($role, '/') . '\s*;/s',
            $this->sql,
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

    private function checkExpression(string $constraint): ?string
    {
        foreach (DdlRowChecks::checksIn($this->sql, 'audit.audit_log') as $check) {
            if ($check['name'] === $constraint) {
                return $check['expression'];
            }
        }

        return null;
    }

    /**
     * @param array<string,mixed> $row
     */
    private function assertCheckRejects(array $row, string $constraint, string $why): void
    {
        $expression = $this->checkExpression($constraint);
        $this->assertNotSame(null, $expression, "audit.audit_log.{$constraint} is missing");
        $this->assertFalse(
            DdlRowChecks::passes((string) $expression, $row),
            "audit.audit_log.{$constraint} accepted {$why}",
        );
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
}
