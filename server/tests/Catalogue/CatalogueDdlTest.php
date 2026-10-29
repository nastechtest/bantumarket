<?php

declare(strict_types=1);

namespace NasTech\Tests\Catalogue;

use NasTech\Catalogue\Schema;
use NasTech\Tests\Support\DdlRowChecks;
use NasTech\Tests\TestCase;

/**
 * 006_catalogue.sql and Schema.php cannot be allowed to drift.
 *
 * There is no PostgreSQL here, so the migration is unexecuted. These tests read
 * it as text, compare the module's declaration in both directions, run every
 * CHECK against the rows a real Catalogue path writes, and then break two rows
 * on purpose to prove the named rules actually say no.
 *
 * The migration also owns three aggregates this module deliberately does not
 * model yet (prohibited-item rules, cities/bands/suburbs, handover venues), so
 * the table comparison is "every declared table exists" rather than "the
 * migration invents no table".
 */
final class CatalogueDdlTest extends TestCase
{
    /** @var array<string, list<array<string,mixed>>>|null */
    private ?array $writtenRows = null;

    public function testEveryModelTableIsCreatedByTheMigration(): void
    {
        $tables = array_keys($this->ddlTables());

        foreach (Schema::TABLES as $phpName => $sqlName) {
            $this->assertTrue(
                in_array($sqlName, $tables, true),
                "{$phpName} ({$sqlName}) is declared in Schema but not created by 006",
            );
        }
        $this->assertSame(4, count(Schema::TABLES), 'the model must declare exactly the four modelled aggregates');
    }

    public function testEveryColumnTheModuleWritesExistsAndNoRequiredColumnIsMissed(): void
    {
        $tables = $this->ddlTables();
        $rows = $this->writtenRows();

        foreach (Schema::TABLES as $table => $sqlName) {
            $this->assertTrue(count($rows[$table] ?? []) > 0, "{$sqlName} has no row from a real Catalogue path");

            foreach ($rows[$table] as $row) {
                foreach (array_keys($row) as $column) {
                    $this->assertTrue(
                        isset($tables[$sqlName]['columns'][$column]),
                        "{$sqlName}.{$column} is written but absent from 006",
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
                    "{$sqlName}.{$name} is NOT NULL with no default but no Catalogue path writes it",
                );
            }
        }
    }

    public function testAppendOnlyTablesCarryTheMutationTriggerAndOthersDoNot(): void
    {
        $locked = [];
        preg_match_all(
            '/CREATE TRIGGER\s+\w+\s+BEFORE UPDATE OR DELETE ON\s+(taxonomy\.[a-z_]+)/',
            $this->migration(),
            $matches,
        );
        $locked = $matches[1];

        $expected = array_map(
            static fn (string $bare): string => Schema::TABLES[$bare],
            Schema::APPEND_ONLY_TABLES,
        );

        $this->assertSame($expected, $locked);
        $this->assertStringContains('shared.forbid_row_mutation()', $this->migration());
    }

    public function testEveryUniqueRuleExistsInBothDirections(): void
    {
        $declared = $this->uniqueIndexesInDdl();

        foreach (Schema::UNIQUE_INDEXES as $table => $definitions) {
            $sqlName = Schema::TABLES[$table];
            foreach ($definitions as $definition) {
                $this->assertTrue(
                    in_array(explode('+', $definition), $declared[$sqlName] ?? [], true),
                    "UNIQUE ({$definition}) on {$sqlName} is enforced in memory but not declared in 006",
                );
            }
        }

        $expected = 0;
        foreach (Schema::UNIQUE_INDEXES as $definitions) {
            $expected += count($definitions);
        }
        $actual = 0;
        foreach (Schema::TABLES as $sqlName) {
            $actual += count($declared[$sqlName] ?? []);
        }
        $this->assertSame($expected, $actual, '006 declares a unique rule on a modelled table that the model does not enforce');
    }

    public function testEveryNamedRowCheckIsDeclaredAndNoExtraNamedOneExists(): void
    {
        $ddl = $this->migration();

        foreach (Schema::TABLES as $sqlName) {
            $declared = [];
            foreach (DdlRowChecks::checksIn($ddl, $sqlName) as $check) {
                if (str_starts_with($check['name'], $sqlName . '_check_')) {
                    continue; // an inline column CHECK, not a named row rule
                }
                $declared[] = $check['name'];
            }
            $expected = Schema::ROW_CHECKS[$sqlName] ?? [];

            foreach ($expected as $constraint) {
                $this->assertTrue(
                    in_array($constraint, $declared, true),
                    "{$sqlName}.{$constraint} is required by Schema::ROW_CHECKS but 006 no longer declares it",
                );
            }
            $this->assertSame(
                [],
                array_values(array_diff($declared, $expected)),
                "{$sqlName} declares a named CHECK that Schema::ROW_CHECKS does not list",
            );
        }
    }

    public function testEveryTriggerRuleAndCrossRecordInvariantExists(): void
    {
        $ddl = $this->migration();

        foreach (Schema::TRIGGER_RULES as $table => $triggers) {
            $this->assertTrue(isset(Schema::TABLES[$table]), "TRIGGER_RULES names unknown table {$table}");
            foreach ($triggers as $trigger) {
                $this->assertStringContains(
                    'CREATE TRIGGER ' . $trigger,
                    $ddl,
                    "{$trigger} is required by Schema::TRIGGER_RULES but absent from 006",
                );
            }
        }

        foreach (Schema::INVARIANT_TRIGGERS as $trigger) {
            $this->assertStringContains(
                'CREATE CONSTRAINT TRIGGER ' . $trigger,
                $ddl,
                "{$trigger} is a cross-record invariant but is absent from 006",
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

    public function testTheMergeAndDigestChecksRejectTheShapesTheyWereWrittenFor(): void
    {
        $rows = $this->writtenRows();
        $ddl = $this->migration();

        $merged = null;
        foreach ($rows['catalogue_categories'] as $row) {
            if ($row['state'] === 'MERGED') {
                $merged = $row;
            }
        }
        $this->assertNotSame(null, $merged, 'the DDL path must exercise a merged category');

        $this->assertCheckRejects(
            'taxonomy.categories',
            array_merge($merged, ['successor_category_id' => null]),
            'decommissioned_category_names_a_successor',
            'a merged category with nowhere to forward to',
        );
        $this->assertCheckRejects(
            'taxonomy.categories',
            array_merge($merged, ['retirement_reason' => '   ']),
            'decommission_states_a_reason',
            'a merge with no reason',
        );

        $version = $rows['catalogue_category_versions'][0];
        $this->assertCheckRejects(
            'taxonomy.category_versions',
            array_merge($version, ['attribute_digest' => 'not-a-digest']),
            'frozen_vocabulary_digest_is_fixed_width',
            'a placeholder where a sha256 belongs',
        );

        $pin = $rows['catalogue_listing_category_pins'][0];
        $this->assertCheckRejects(
            'taxonomy.listing_category_pins',
            array_merge($pin, ['answers_digest' => $pin['attribute_digest']]),
            'pin_digests_are_two_different_facts',
            'one digest reported as two facts',
        );
    }

    public function testTheAppRoleCanAppendEvidenceButNeverDeleteIt(): void
    {
        $ddl = $this->migration();
        $grants = $this->grantsTo('nastech_app');

        $versions = $grants[Schema::TABLES['catalogue_category_versions']] ?? '';
        $this->assertStringContains('SELECT', $versions);
        $this->assertStringContains('INSERT', $versions);
        $this->assertFalse(str_contains($versions, 'UPDATE'), 'published versions must not be updatable by the app role');

        foreach (['catalogue_attribute_definitions', 'catalogue_categories', 'catalogue_listing_category_pins'] as $table) {
            $privileges = $grants[Schema::TABLES[$table]] ?? '';
            $this->assertStringContains('SELECT', $privileges, $table . ' must be readable');
            $this->assertStringContains('INSERT', $privileges, $table . ' must be writable');
            $this->assertStringContains('UPDATE', $privileges, $table . ' must stay updatable');
            $this->assertFalse(str_contains($privileges, 'DELETE'), $table . ' must not be deletable');
        }

        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*DELETE[^;]*TO\s+nastech_app/s', $ddl),
            'the migration grants DELETE to the application role',
        );
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*DELETE[^;]*TO\s+nastech_owner/s', $ddl),
            'the owner role must not delete a taxonomy row',
        );
    }

    /**
     * @return array<string, list<array<string,mixed>>>
     */
    private function writtenRows(): array
    {
        if ($this->writtenRows !== null) {
            return $this->writtenRows;
        }

        return $this->writtenRows = (new CatalogueFixture())->rowsAfterMerge();
    }

    /**
     * @return array<string, array{columns: array<string, array{not_null:bool, has_default:bool}>}>
     */
    private function ddlTables(): array
    {
        $sql = preg_replace('/--.*$/m', '', $this->migration()) ?? '';
        preg_match_all('/CREATE TABLE ([a-z_]+\.[a-z_]+) \((.*?)\n\);/s', $sql, $matches, PREG_SET_ORDER);

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

    /**
     * @return array<string, list<list<string>>>
     */
    private function uniqueIndexesInDdl(): array
    {
        $sql = preg_replace('/--.*$/m', '', $this->migration()) ?? '';
        $indexes = [];

        preg_match_all(
            '/CREATE UNIQUE INDEX\s+\w+\s+ON\s+([a-z_]+\.[a-z_]+)\s*\(([^)]*)\)/',
            $sql,
            $matches,
            PREG_SET_ORDER,
        );
        foreach ($matches as [$_, $table, $columnList]) {
            $indexes[$table][] = array_map(
                static fn (string $column): string => trim(strtolower(trim($column))),
                explode(',', $columnList),
            );
        }

        preg_match_all('/CREATE TABLE ([a-z_]+\.[a-z_]+) \((.*?)\n\);/s', $sql, $tables, PREG_SET_ORDER);
        foreach ($tables as [$_, $table, $body]) {
            $columnSection = preg_split('/\n\s*CONSTRAINT\s+/', $body)[0] ?? $body;
            preg_match_all('/^\s*([a-z_]+)\s+[^,\n]*\bUNIQUE\b/m', $columnSection, $inline);
            foreach ($inline[1] as $column) {
                $indexes[$table][] = [trim(strtolower($column))];
            }
        }

        return $indexes;
    }

    /**
     * @return array<string, string>
     */
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
    private function assertCheckRejects(string $sqlName, array $row, string $constraint, string $why): void
    {
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
        return Schema::migration();
    }
}
