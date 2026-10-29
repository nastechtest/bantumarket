<?php

declare(strict_types=1);

namespace NasTech\Tests\Payouts;

use NasTech\Payouts\BankBrand;
use NasTech\Payouts\PayoutBatch;
use NasTech\Payouts\PayoutLine;
use NasTech\Payouts\Schema;
use NasTech\Tests\Payouts\Support\PayoutsFixture;
use NasTech\Tests\Support\DdlRowChecks;
use NasTech\Tests\TestCase;

/**
 * 014_payouts.sql and the PHP model must not drift.
 *
 * There is no PostgreSQL here, so the migration is unexecuted text. These tests
 * compare both directions against Schema.php, then take the rows a released
 * batch actually writes and hand them to every named CHECK — and break each row
 * on purpose to prove the CHECK refuses what it claims to. A check that exists
 * but never rejects is indistinguishable from no check until an auditor reads
 * the row.
 */
final class PayoutsDdlTest extends TestCase
{
    private string $sql;
    private PayoutsFixture $fx;

    public function setUp(): void
    {
        $this->sql = (string) file_get_contents(dirname(__DIR__, 2) . '/db/migrations/014_payouts.sql');
        $this->fx = new PayoutsFixture();
    }

    public function testTheMigrationCreatesExactlyTheTablesTheModelKnows(): void
    {
        $created = $this->tablesInDdl();
        $expected = array_values(Schema::TABLES);

        sort($created);
        sort($expected);

        $this->assertSame($expected, $created);
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
            $this->assertTrue(in_array($name, $declared, true), "{$name} ({$table}) is modelled but has no named CHECK in 014");
        }
        foreach ($declared as $name) {
            $this->assertTrue(isset($modelled[$name]), "{$name} is a CHECK in 014 but is not listed in Schema::ROW_CHECKS");
        }
    }

    public function testEveryUniqueRuleInTheModelIsAUniqueConstraintInTheDdl(): void
    {
        $constraints = $this->uniqueConstraintsByTable();

        foreach (Schema::UNIQUE_INDEXES as $table => $definitions) {
            $bare = substr(Schema::TABLES[$table], strlen('payouts.'));
            foreach ($definitions as $definition) {
                $columns = array_map('trim', explode('+', $definition));
                $this->assertTrue(
                    in_array($columns, $constraints[$bare] ?? [], true),
                    sprintf('UNIQUE (%s) on payouts.%s is enforced in memory but absent from 014', implode(', ', $columns), $bare),
                );
            }
        }
    }

    public function testTheBrandAndStatusVocabulariesAreTheCodeConstants(): void
    {
        $brands = $this->stringsInList('bank_brand');
        $declaredBrands = BankBrand::values();
        sort($brands);
        sort($declaredBrands);
        $this->assertSame($declaredBrands, $brands, 'the DDL brand list and BankBrand must agree in both directions');

        $statuses = $this->stringsInList('status');
        $declaredStatuses = PayoutBatch::STATUSES;
        sort($statuses);
        sort($declaredStatuses);
        $this->assertSame($declaredStatuses, $statuses, 'the DDL status list and PayoutBatch::STATUSES must agree');
    }

    public function testTheRowsTheModuleWritesPassEveryCheckInTheMigration(): void
    {
        $rows = $this->writtenRows();

        foreach ($rows as $table => $row) {
            $checks = DdlRowChecks::checksIn($this->sql, 'payouts.' . $table);
            $this->assertTrue($checks !== [], "payouts.{$table} declares no CHECK at all");

            foreach ($checks as $check) {
                $this->assertTrue(
                    DdlRowChecks::passes($check['expression'], $row),
                    sprintf('%s refused a row the module actually writes: %s', $check['name'], json_encode($row)),
                );
            }
        }
    }

    public function testEachInvariantRefusesABrokenBatchRow(): void
    {
        $valid = $this->writtenRows()['payout_batches'];

        $this->assertCheckRefuses('payout_batches', 'approver_is_not_the_maker', ['approved_by' => $valid['prepared_by']] + $valid);
        $this->assertCheckRefuses('payout_batches', 'released_batch_has_an_approver', ['approved_by' => null] + $valid);
        $this->assertCheckRefuses(
            'payout_batches',
            'failed_batch_was_released_and_explained',
            ['status' => 'FAILED', 'released_at' => null] + $valid,
        );
        $this->assertCheckRefuses('payout_batches', 'batch_status_is_known', ['status' => 'PAID'] + $valid);
        $this->assertCheckRefuses('payout_batches', 'batch_total_is_positive', ['total_cents' => 0] + $valid);
        $this->assertCheckRefuses('payout_batches', 'preparer_is_named', ['prepared_by' => '   '] + $valid);
        $this->assertCheckRefuses('payout_batches', 'batch_key_is_not_blank', ['payout_key' => '   '] + $valid);
    }

    public function testEachInvariantRefusesABrokenLineRow(): void
    {
        $valid = $this->writtenRows()['payout_lines'];

        $this->assertCheckRefuses(
            'payout_lines',
            'masked_last_four_is_four_digits',
            ['bank_last_four' => '12345678'] + $valid,
        );
        $this->assertCheckRefuses(
            'payout_lines',
            'masked_brand_is_known',
            ['bank_brand' => 'capitec_1234567890'] + $valid,
        );
        $this->assertCheckRefuses('payout_lines', 'line_amount_is_positive', ['amount_cents' => 0] + $valid);
        $this->assertCheckRefuses('payout_lines', 'line_names_its_order', ['order_id' => '   '] + $valid);
        $this->assertCheckRefuses(
            'payout_lines',
            'reversal_follows_a_ledger_row',
            ['reversal_ledger_entry_id' => 'led_invented', 'ledger_entry_id' => null] + $valid,
        );
    }

    public function testTheAppRoleCanInsertBothTablesAndDeleteNeither(): void
    {
        $inserted = $this->grantedToApp('INSERT');
        sort($inserted);
        $expected = array_values(Schema::TABLES);
        sort($expected);

        $this->assertSame($expected, $inserted, 'a table the module writes without INSERT is a production failure');
        $this->assertFalse(
            preg_match('/GRANT[^;]*DELETE[^;]*TO nastech_app;/s', $this->sql) === 1,
            'nastech_app must have no DELETE grant in the payouts schema',
        );
    }

    public function testTheMigrationIsAtomicAndOwnsNoTrigger(): void
    {
        $this->assertStringContains('BEGIN;', $this->sql);
        $this->assertStringContains('COMMIT;', $this->sql);
        $this->assertFalse(preg_match('/CREATE\s+TRIGGER/i', $this->sql) === 1, 'Payouts owns no append-only table; a trigger is not needed');
        $this->assertFalse(preg_match('/ALTER\s+TRIGGER/i', $this->sql) === 1, 'no ALTER TRIGGER ... OWNER TO belongs in 014');
        $this->assertFalse(preg_match('/\bCONSTANT\b/i', $this->sql) === 1, 'no plpgsql CONSTANT variable is reassigned here');
    }

    public function testTheMigrationIsNumberedAfterReporting(): void
    {
        $directory = dirname(__DIR__, 2) . '/db/migrations';
        $files = glob($directory . '/*.sql') ?: [];
        sort($files);
        $names = array_map('basename', $files);

        $this->assertTrue(in_array('013_reporting.sql', $names, true));
        $this->assertSame('014_payouts.sql', basename((string) end($files)), '014 is reserved for Payouts and must sort last');
        $this->assertStringContains('after 013_reporting.sql', $this->sql);
    }

    /**
     * @return array{payout_batches: array<string,mixed>, payout_lines: array<string,mixed>}
     */
    private function writtenRows(): array
    {
        $batch = $this->fx->prepare('po_ddl', 'stf_ana', [$this->fx->line(1_000)]);
        $this->fx->approve->handle($batch->id, 'stf_ben');
        $stored = $this->fx->batches->require($batch->id);
        $store = $this->fx->money->kernel->store;

        $batchRow = $store->find(PayoutBatch::TABLE, $batch->id);
        $lineRow = $store->find(PayoutLine::TABLE, $stored->lines[0]->id);
        if ($batchRow === null || $lineRow === null) {
            $this->fail('the released batch did not write both rows');
        }

        return ['payout_batches' => $batchRow, 'payout_lines' => $lineRow];
    }

    /**
     * @param array<string,mixed> $row
     */
    private function assertCheckRefuses(string $table, string $checkName, array $row): void
    {
        $expression = null;
        foreach (DdlRowChecks::checksIn($this->sql, 'payouts.' . $table) as $check) {
            if ($check['name'] === $checkName) {
                $expression = $check['expression'];
            }
        }

        $this->assertNotSame(null, $expression, "{$checkName} is not declared on payouts.{$table}");
        $this->assertFalse(
            DdlRowChecks::passes((string) $expression, $row),
            "{$checkName} accepted a row it must refuse",
        );
    }

    /**
     * @return list<string>
     */
    private function tablesInDdl(): array
    {
        preg_match_all('/CREATE TABLE (payouts\.[a-z_]+)/', $this->sql, $matches);

        return $matches[1];
    }

    /**
     * @return array<string, list<list<string>>>
     */
    private function uniqueConstraintsByTable(): array
    {
        $map = [];
        preg_match_all('/CREATE TABLE payouts\.([a-z_]+) \((.*?)\n\);/s', $this->sql, $tables, PREG_SET_ORDER);
        foreach ($tables as [, $table, $body]) {
            preg_match_all('/CONSTRAINT [a-z_]+ UNIQUE \(([^)]+)\)/', $body, $uniques);
            foreach ($uniques[1] as $columns) {
                $map[$table][] = array_map('trim', explode(',', $columns));
            }
        }

        return $map;
    }

    /**
     * The quoted values of the first `$column IN (...)` clause in the DDL.
     *
     * @return list<string>
     */
    private function stringsInList(string $column): array
    {
        if (preg_match('/' . preg_quote($column, '/') . '\s+IN\s*\(([^)]+)\)/s', $this->sql, $match) !== 1) {
            $this->fail("no {$column} IN (...) list found in 014");
        }
        preg_match_all("/'([^']+)'/", $match[1], $values);

        return $values[1];
    }

    /**
     * @return list<string>
     */
    private function grantedToApp(string $privilege): array
    {
        preg_match_all('/GRANT([^;]*)TO nastech_app;/s', $this->sql, $match);
        $tables = [];
        foreach ($match[1] as $index => $block) {
            if (!str_contains($block, $privilege)) {
                continue;
            }
            preg_match_all('/payouts\.[a-z_]+/', $block, $found);
            $tables = array_merge($tables, $found[0]);
        }

        return array_values(array_unique($tables));
    }
}
