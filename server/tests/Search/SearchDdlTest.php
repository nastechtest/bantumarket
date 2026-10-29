<?php

declare(strict_types=1);

namespace NasTech\Tests\Search;

use NasTech\Search\Schema;
use NasTech\Search\SearchDocument;
use NasTech\Tests\Search\Support\SearchFixture;
use NasTech\Tests\Support\DdlRowChecks;
use NasTech\Tests\TestCase;

/**
 * 011_search.sql and Schema.php cannot be allowed to drift.
 *
 * There is no PostgreSQL here, so the migration is unexecuted. These tests read
 * it as text and check both directions against the PHP model, run every named
 * CHECK against the rows a real rebuild writes, break each row on purpose to
 * prove the CHECK says no, and assert the structural promise: the table and the
 * result view contain exactly the closed, non-personal projection column list.
 */
final class SearchDdlTest extends TestCase
{
    /** @var array<string, list<array<string,mixed>>>|null */
    private ?array $writtenRows = null;

    public function testEveryModelTableIsCreatedAndTheDdlInventsNoTable(): void
    {
        $tables = $this->ddlTables();

        foreach (Schema::TABLES as $phpName => $sqlName) {
            $this->assertTrue(isset($tables[$sqlName]), "{$phpName} ({$sqlName}) is not created by 011");
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
            $this->assertTrue(count($rows[$table] ?? []) > 0, "{$sqlName} has no row from a real rebuild");

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
                    "{$sqlName}.{$name} is NOT NULL with no default but no Search path writes it",
                );
            }
        }
    }

    public function testTheIndexIsMutableSoNoAppendOnlyTriggerIsDeclared(): void
    {
        $this->assertSame([], $this->appendOnlyTriggerTables());
        $this->assertSame([], Schema::APPEND_ONLY_TABLES, 'a rebuild overwrites rows; it does not append evidence');
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
                    "{$trigger} is required by Schema::TRIGGER_RULES but absent from 011",
                );
            }
        }
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
                    "{$sqlName}.{$constraint} is required by Schema::ROW_CHECKS but 011 no longer declares it",
                );
            }
            $this->assertSame(
                [],
                array_values(array_diff($declaredNames, $expected)),
                "{$sqlName} declares a named CHECK that Schema::ROW_CHECKS does not list",
            );
        }
    }

    public function testEveryRowARealRebuildWritesSatisfiesEveryCheckOnItsTable(): void
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
                        sprintf('%s.%s rejects the real row %d', $sqlName, $check['name'], $index),
                    );
                }
            }
        }
    }

    public function testEveryCheckRejectsTheShapeItWasWrittenFor(): void
    {
        $row = $this->firstRow('search_documents');

        $this->assertCheckRejects('search_documents', array_merge($row, ['title' => '   ']), 'title_is_present', 'a blank title');
        $this->assertCheckRejects('search_documents', array_merge($row, ['category_path' => 'Watches / Divers']), 'category_path_is_a_slug_path', 'a free-text category');
        $this->assertCheckRejects('search_documents', array_merge($row, ['price_cents' => -1]), 'price_is_not_negative', 'a negative price');
        $this->assertCheckRejects('search_documents', array_merge($row, ['condition' => 'broken']), 'condition_is_known', 'an invented condition');
        $this->assertCheckRejects('search_documents', array_merge($row, ['seller_tier' => 'T9']), 'seller_tier_is_known', 'an invented tier');
        $this->assertCheckRejects('search_documents', array_merge($row, ['source_version' => 0]), 'source_version_is_positive', 'version zero');
    }

    public function testTheTableAndResultViewExposeExactlyTheClosedProjection(): void
    {
        $tables = $this->ddlTables();
        $tableColumns = array_keys($tables['search.documents']['columns']);
        $viewColumns = $this->resultViewColumns();

        $this->assertSame(Schema::DOCUMENT_TABLE_COLUMNS, $tableColumns, 'the table stores a column the model does not define');
        $this->assertSame(Schema::DOCUMENT_COLUMNS, $viewColumns, 'the result view and the model disagree on the public projection');
    }

    public function testNeitherTheTableNorTheResultViewCanNameAPersonalField(): void
    {
        $tables = $this->ddlTables();
        $tableColumns = array_keys($tables['search.documents']['columns']);
        $viewColumns = $this->resultViewColumns();

        foreach (SearchDocument::PERSONAL_FIELDS as $field) {
            $this->assertFalse(in_array($field, $tableColumns, true), "search.documents must not carry {$field}");
            $this->assertFalse(in_array($field, $viewColumns, true), "search.result_documents must not expose {$field}");
        }
    }

    public function testTheAppRoleCanRebuildAndReadButNeverDelete(): void
    {
        $ddl = $this->migration();
        $grants = $this->grantsTo('nastech_app');

        $documents = $grants['search.documents'] ?? '';
        $this->assertStringContains('SELECT', $documents, 'the app role must read the index');
        $this->assertStringContains('INSERT', $documents, 'the app role must create a projection row');
        $this->assertStringContains('UPDATE', $documents, 'the app role must replace a row from a newer source version');
        $this->assertFalse(str_contains($documents, 'DELETE'), 'a rebuild never deletes a row');
        $this->assertFalse(str_contains($documents, 'TRUNCATE'), 'a rebuild is not a truncate');
        $this->assertFalse(str_contains($documents, 'ALL'), 'no ALL privilege in the search schema');

        $this->assertStringContains('SELECT', $grants['search.result_documents'] ?? '', 'the result view must be readable');
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*DELETE[^;]*TO\s+nastech_app/s', $ddl),
            'the migration grants DELETE to the application role',
        );
    }

    public function testTheOwnerCanReadButNotRewriteTheIndex(): void
    {
        $ddl = $this->migration();

        $this->assertStringContains(
            'GRANT SELECT ON ALL TABLES IN SCHEMA search TO nastech_owner',
            $ddl,
            'the owner role must be able to read the projection',
        );
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*UPDATE[^;]*TO\s+nastech_owner/s', $ddl),
            'the owner role must not rewrite a projection row',
        );
        $this->assertFalse(
            (bool) preg_match('/GRANT[^;]*DELETE[^;]*TO\s+nastech_owner/s', $ddl),
            'the owner role must not delete a projection row',
        );
    }

    public function testSearchNeverReadsAnotherModulesSchema(): void
    {
        $withoutComments = preg_replace('/--.*$/m', '', $this->migration()) ?? '';
        preg_match_all(
            '/\b(orders|payments|commissions|settlements|handover|identity|media|catalogue|taxonomy|messaging|reporting|audit|payouts|capture|disputes|safety|listings)\./',
            $withoutComments,
            $matches,
        );

        $this->assertSame([], $matches[1], 'Search is a projection; it reads no module schema from SQL');
    }

    public function testTheMigrationIsShapedLikeItsNeighbours(): void
    {
        $ddl = $this->migration();
        $withoutComments = preg_replace('/--.*$/m', '', $ddl) ?? '';

        $this->assertStringContains('BEGIN;', $ddl);
        $this->assertStringContains('COMMIT;', $ddl);
        $this->assertStringContains('migration 011', $ddl);
        $this->assertStringContains('BEFORE UPDATE ON search.documents', $withoutComments);
        $this->assertStringContains('NEW.source_version < OLD.source_version', $withoutComments);
        $this->assertFalse(str_contains($withoutComments, 'ALTER TRIGGER'), 'no ALTER TRIGGER ... OWNER in this tree');
        $this->assertFalse(str_contains($withoutComments, 'DECLARE'), 'no PL/pgSQL variables that could be reassigned');
    }

    // ------------------------------------------------------------------
    // The path that writes every table
    // ------------------------------------------------------------------

    /**
     * @return array<string, list<array<string,mixed>>>
     */
    private function writtenRows(): array
    {
        if ($this->writtenRows !== null) {
            return $this->writtenRows;
        }

        $fx = new SearchFixture();
        $fx->indexAll();

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
                if (preg_match('/^([a-z_][a-z0-9_]*)\s+\S/i', $line, $m) !== 1) {
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

    /**
     * @return list<string>
     */
    private function resultViewColumns(): array
    {
        if (preg_match(
            '/CREATE VIEW search\.result_documents AS\s*SELECT\s+(.*?)\s*FROM search\.documents;/s',
            $this->migration(),
            $matches,
        ) !== 1) {
            $this->fail('the result view is missing or is not a SELECT over search.documents');
        }

        $columns = preg_split('/\s*,\s*/', trim(preg_replace('/\s+/', ' ', $matches[1]) ?? '')) ?: [];

        return array_map('trim', $columns);
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

    private function migration(): string
    {
        $path = dirname(__DIR__, 2) . '/db/migrations/011_search.sql';
        $contents = @file_get_contents($path);
        if ($contents === false) {
            $this->fail('migration is missing: ' . $path);
        }

        return $contents;
    }
}
