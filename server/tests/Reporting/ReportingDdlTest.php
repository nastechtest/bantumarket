<?php

declare(strict_types=1);

namespace NasTech\Tests\Reporting;

use NasTech\Reporting\ReportName;
use NasTech\Reporting\Schema;
use NasTech\Tests\TestCase;

/**
 * The migration and the running model must not drift.
 *
 * No PostgreSQL server is reachable here, so 013 is unexecuted SQL. The danger
 * is a gap that only appears in production: a table the code writes without a
 * grant, an append-only table with an UPDATE grant, a view that answers "now"
 * instead of a stated as-of. Each is checked here in both directions.
 */
final class ReportingDdlTest extends TestCase
{
    private string $sql;

    public function setUp(): void
    {
        $this->sql = (string) file_get_contents(dirname(__DIR__, 2) . '/db/migrations/013_reporting.sql');
    }

    public function testTheDdlCreatesExactlyTheTablesTheModelKnows(): void
    {
        $created = $this->tablesInDdl();
        $expected = array_values(Schema::TABLES);

        sort($created);
        sort($expected);

        $this->assertSame($expected, $created);
    }

    public function testAppendOnlyTablesCarryAMutationTriggerAndMutableOnesDoNot(): void
    {
        preg_match_all('/BEFORE UPDATE OR DELETE ON reporting\.([a-z_]+)/', $this->sql, $matches);
        $locked = $matches[1];
        sort($locked);

        $expected = array_map(
            static fn (string $bare): string => substr(Schema::TABLES[$bare], strlen('reporting.')),
            Schema::APPEND_ONLY_TABLES,
        );
        sort($expected);

        $this->assertSame($expected, $locked);
        $this->assertStringContains('shared.forbid_row_mutation()', $this->sql);
    }

    public function testEveryUniqueRuleInTheModelIsAUniqueConstraintInTheDdl(): void
    {
        $constraints = $this->uniqueConstraintsByTable();

        foreach (Schema::UNIQUE_INDEXES as $table => $definitions) {
            $bare = substr(Schema::TABLES[$table], strlen('reporting.'));
            foreach ($definitions as $definition) {
                $columns = array_map('trim', explode('+', $definition));
                $this->assertTrue(
                    in_array($columns, $constraints[$bare] ?? [], true),
                    sprintf('UNIQUE (%s) on reporting.%s is enforced in memory but absent from 013', implode(', ', $columns), $bare),
                );
            }
        }
    }

    public function testEveryNamedCheckIsDeclaredAndEveryDeclaredCheckIsNamedInTheModel(): void
    {
        preg_match_all('/CONSTRAINT ([a-z_]+) CHECK/', $this->sql, $matches);
        $declared = $matches[1];

        $modelled = [];
        foreach (Schema::ROW_CHECKS as $table => $names) {
            foreach ($names as $name) {
                $modelled[$name] = $table;
            }
        }

        foreach ($modelled as $name => $table) {
            $this->assertTrue(in_array($name, $declared, true), "{$name} ({$table}) is modelled but has no named CHECK in 013");
        }
        foreach ($declared as $name) {
            $this->assertTrue(isset($modelled[$name]), "{$name} is a CHECK in 013 but is not listed in Schema::ROW_CHECKS");
        }
    }

    public function testTheViewListIsExactlyTheReportCatalogue(): void
    {
        preg_match_all('/CREATE VIEW reporting\.(v_[a-z_]+) AS/', $this->sql, $matches);
        $views = $matches[1];
        sort($views);

        $expected = array_map(static fn (ReportName $name): string => substr($name->view(), strlen('reporting.')), ReportName::cases());
        sort($expected);

        $this->assertSame($expected, $views, 'a report without a view, or a view without a report, is drift');
    }

    public function testEveryViewIsSnapshotParameterisedOnBothClocks(): void
    {
        $blocks = preg_split('/CREATE VIEW reporting\.v_[a-z_]+ AS/', $this->sql);
        array_shift($blocks);

        foreach ($blocks as $index => $block) {
            $body = preg_split('/;\s*\n/', $block)[0];
            $this->assertStringContains('reporting.report_snapshots', $body, "view #{$index} does not read the snapshot table");
            $this->assertStringContains('s.as_of', $body, "view #{$index} does not filter business time");
            $this->assertStringContains('s.ingested_through', $body, "view #{$index} does not filter ingestion time");
        }
    }

    public function testTheAppRoleCanInsertEveryTableItWritesButCannotDeleteAnything(): void
    {
        $inserted = $this->grantsToApp('INSERT');
        $expected = array_values(Schema::TABLES);
        sort($inserted);
        sort($expected);

        $this->assertSame($expected, $inserted, 'a table the worker writes without INSERT is a production failure');

        $this->assertFalse(
            preg_match('/GRANT[^;]*DELETE[^;]*TO nastech_app/', $this->sql) === 1,
            'nastech_app must have no DELETE grant in the reporting schema',
        );
    }

    public function testTheAppRoleCanUpdateOnlyTheLifecycleTables(): void
    {
        $updated = $this->grantsToApp('UPDATE');
        sort($updated);

        $expected = [
            'reporting.capture_facts',
            'reporting.dispute_facts',
            'reporting.listing_facts',
            'reporting.order_facts',
            'reporting.projection_state',
        ];

        $this->assertSame($expected, $updated);
        $this->assertFalse(in_array('reporting.ledger_facts', $updated, true));
        $this->assertFalse(in_array('reporting.commission_facts', $updated, true));
    }

    public function testReportingNeverReadsAnotherModulesSchema(): void
    {
        $withoutComments = preg_replace('/--.*$/m', '', $this->sql) ?? '';
        preg_match_all('/\b(commissions|settlements|orders|payments|catalogue|identity|media|handover|payouts|edge)\./', $withoutComments, $matches);

        $this->assertSame([], $matches[1], 'Reporting has no outbound module edges; the event feed is its only input');
    }

    public function testTheSnapshotCheckForbidsKnowledgeFromTheFuture(): void
    {
        $this->assertStringContains('CONSTRAINT snapshot_knows_nothing_from_the_future', $this->sql);

        $snapshots = $this->tableDefinition('report_snapshots');
        $this->assertStringContains('ingested_through <= closed_at', $snapshots);
    }

    /**
     * @return list<string>
     */
    private function tablesInDdl(): array
    {
        preg_match_all('/CREATE TABLE (reporting\.[a-z_]+)/', $this->sql, $matches);

        return $matches[1];
    }

    /**
     * @return array<string, list<list<string>>>
     */
    private function uniqueConstraintsByTable(): array
    {
        $map = [];
        preg_match_all('/CREATE TABLE reporting\.([a-z_]+) \((.*?)\n\);/s', $this->sql, $tables, PREG_SET_ORDER);
        foreach ($tables as [, $table, $body]) {
            preg_match_all('/CONSTRAINT [a-z_]+ UNIQUE \(([^)]+)\)/', $body, $uniques);
            foreach ($uniques[1] as $columns) {
                $map[$table][] = array_map('trim', explode(',', $columns));
            }
        }

        return $map;
    }

    /**
     * @return list<string>
     */
    private function grantsToApp(string $privilege): array
    {
        preg_match_all('/GRANT ' . $privilege . ' ON(.*?)TO nastech_app;/s', $this->sql, $match);
        $tables = [];
        foreach ($match[1] as $block) {
            preg_match_all('/reporting\.[a-z_]+/', $block, $found);
            $tables = array_merge($tables, $found[0]);
        }

        return array_values(array_unique($tables));
    }

    private function tableDefinition(string $bare): string
    {
        preg_match('/CREATE TABLE reporting\.' . $bare . ' \((.*?)\n\);/s', $this->sql, $match);

        return $match[1] ?? '';
    }
}
