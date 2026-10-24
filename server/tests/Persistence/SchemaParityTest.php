<?php

declare(strict_types=1);

namespace NasTech\Tests\Persistence;

use NasTech\Commissions\CommissionEntry;
use NasTech\Listings\Listing;
use NasTech\Orders\Order;
use NasTech\Payments\WebhookEvent;
use NasTech\Settlements\Ledger;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Persistence\Schema;
use NasTech\Tests\Support\MoneyFixture;
use NasTech\Tests\TestCase;

/**
 * The DDL and the in-memory model must not be allowed to drift.
 *
 * Neither migration file has been run: this environment has no PostgreSQL and no
 * PDO driver, so the SQL here is unexecuted. That is exactly the situation in
 * which a silent divergence is dangerous — Schema.php is the list the running code
 * enforces, and 001_money_path.sql is the list production will enforce. If a
 * column is added to an aggregate and forgotten in the migration, or an append-only
 * table is granted UPDATE, the first evidence is a live money bug.
 *
 * These tests are what closes that gap without a server. They prove the two declare
 * the same tables, constraints and columns. They do NOT prove the SQL parses or that
 * a deferred constraint trigger behaves as described: `psql -v ON_ERROR_STOP=1`
 * against a real cluster is still required, and is an open item, not a formality.
 */
final class SchemaParityTest extends TestCase
{
    private const MIGRATIONS = [
        '001' => '/db/migrations/001_money_path.sql',
        '002' => '/db/migrations/002_roles_and_grants.sql',
    ];

    /**
     * Tables the DDL owns but the money path never writes. policies is the one:
     * CommissionPolicyRegistry is still built in memory, so the store holds no rows
     * and column parity cannot be derived by running the path.
     *
     * @var list<string>
     */
    private const DDL_ONLY_TABLES = ['commissions.policies'];

    /** @var array<string, list<string>> captured from a real run of the money path */
    private array $writtenColumns = [];

    public function testEveryTableTheModelKnowsIsCreatedByTheDdl(): void
    {
        $tables = $this->ddlTables();

        foreach (Schema::TABLES as $phpName => $sqlName) {
            $this->assertTrue(
                isset($tables[$sqlName]),
                sprintf('%s (%s) is declared in Schema::TABLES but no migration creates it', $phpName, $sqlName),
            );
        }
    }

    public function testTheDdlCreatesNoTableTheModelDoesNotKnowAbout(): void
    {
        $known = array_values(Schema::TABLES);

        foreach (array_keys($this->ddlTables()) as $sqlName) {
            if (in_array($sqlName, self::DDL_ONLY_TABLES, true)) {
                continue;
            }
            $this->assertTrue(
                in_array($sqlName, $known, true),
                sprintf('%s is created by the DDL but is absent from Schema::TABLES', $sqlName),
            );
        }
    }

    public function testEveryAppendOnlyTableIsLockedByAMutationTrigger(): void
    {
        $locked = $this->appendOnlyTablesInDdl();

        foreach (Schema::APPEND_ONLY_TABLES as $table) {
            $sqlName = Schema::TABLES[$table] ?? null;
            $this->assertNotSame(null, $sqlName, "{$table} is append-only but is not in Schema::TABLES");
            $this->assertTrue(
                in_array($sqlName, $locked, true),
                sprintf(
                    '%s is in APPEND_ONLY_TABLES but the DDL has no BEFORE UPDATE OR DELETE trigger for it. '
                    . 'The in-memory store would refuse the write and production would accept it.',
                    $sqlName,
                ),
            );
        }

        // The reverse direction, which is the one that bites: a trigger nobody asked
        // for locks out a column the application legitimately updates.
        foreach ($locked as $sqlName) {
            $phpName = array_search($sqlName, Schema::TABLES, true);
            $this->assertTrue(
                $phpName !== false && in_array($phpName, Schema::APPEND_ONLY_TABLES, true),
                sprintf('%s has an append-only trigger but is not in APPEND_ONLY_TABLES', $sqlName),
            );
        }
    }

    public function testEveryUniqueIndexTheModelEnforcesExistsInTheDdl(): void
    {
        $indexes = $this->uniqueIndexesInDdl();

        foreach (Schema::UNIQUE_INDEXES as $table => $definitions) {
            $sqlName = Schema::TABLES[$table];
            foreach ($definitions as $definition) {
                $columns = explode('+', $definition);
                $this->assertTrue(
                    in_array($columns, $indexes[$sqlName] ?? [], true),
                    sprintf(
                        'UNIQUE (%s) on %s is enforced in memory but not declared in the DDL. '
                            . 'A duplicate that the model refuses would commit in production.',
                        implode(', ', $columns),
                        $sqlName,
                    ),
                );
            }
        }
    }

    public function testEveryColumnTheMoneyPathWritesExistsInTheDdl(): void
    {
        $tables = $this->ddlTables();
        $this->driveMoneyPath();

        foreach ($this->writtenColumns as $table => $columns) {
            $sqlName = Schema::TABLES[$table] ?? null;
            $this->assertNotSame(null, $sqlName, "{$table} is written by the money path but is not in Schema::TABLES");
            $this->assertTrue(
                isset($tables[$sqlName]),
                sprintf('%s is written by the money path but not created by the DDL', $sqlName),
            );

            foreach ($columns as $column) {
                $this->assertTrue(
                    isset($tables[$sqlName]['columns'][$column]),
                    sprintf(
                        '%s.%s is written by the money path but has no column in the DDL. '
                            . 'The aggregate gained a field and the migration did not.',
                        $sqlName,
                        $column,
                    ),
                );
            }
        }
    }

    public function testNoDdlColumnIsRequiredThatTheMoneyPathDoesNotWrite(): void
    {
        $tables = $this->ddlTables();
        $this->driveMoneyPath();

        foreach ($this->writtenColumns as $table => $columns) {
            $sqlName = Schema::TABLES[$table];
            foreach ($tables[$sqlName]['columns'] as $name => $detail) {
                if (!$detail['not_null'] || $detail['has_default']) {
                    continue;
                }
                $this->assertTrue(
                    in_array($name, $columns, true),
                    sprintf(
                        '%s.%s is NOT NULL with no default, but the money path never writes it. '
                            . 'Every insert against that column would fail on the first deploy.',
                        $sqlName,
                        $name,
                    ),
                );
            }
        }
    }

    public function testTheFiveMoneyInvariantsExistAsDeferredCommitTriggers(): void
    {
        $sql = $this->migration('001');

        // The PHP checker runs on every commit. The SQL equivalent has to be a
        // DEFERRABLE INITIALLY DEFERRED constraint trigger, because that is the only
        // PostgreSQL shape that evaluates at commit rather than per statement — which
        // is what makes the order of writes inside a transaction irrelevant.
        foreach ([
            'invariant_paid_order_has_ledger' => 'a post-payment state with no ledger row',
            'invariant_earnings_have_evidence' => 'earnings with no commission evidence',
            'invariant_refund_reverses_commission' => 'a refund that keeps the commission',
            'invariant_closed_order_has_no_hold' => 'a closed order still holding money',
            'invariant_balance_never_negative' => 'a negative seller balance',
        ] as $trigger => $failure) {
            $this->assertStringContains(
                'CREATE CONSTRAINT TRIGGER ' . $trigger,
                $sql,
                $failure,
            );
        }

        $functions = $this->matches('/CREATE FUNCTION settlements\.(invariant_\w+)/', $sql);
        $attachments = $this->matches('/EXECUTE FUNCTION settlements\.(invariant_\w+)/', $sql);

        // Six functions, not five: "a closed order must not still hold money" is
        // violated from two sides, and one function that branched on which table
        // fired it would read the wrong id.
        $this->assertCount(6, $functions, 'the invariant functions declared');

        // The failure this catches: an invariant written and never attached, which
        // reads exactly like an enforced rule when the file is skimmed.
        $orphans = array_values(array_diff($functions, $attachments));
        $this->assertSame([], $orphans, 'invariant functions with no trigger attached');

        $missing = array_values(array_diff($attachments, $functions));
        $this->assertSame([], $missing, 'triggers executing an invariant function the file never creates');

        $this->assertSame(
            count($attachments),
            preg_match_all('/DEFERRABLE INITIALLY DEFERRED/', $sql),
            'every invariant attachment defers to commit; a per-statement check would refuse the '
                . 'ledger row that is written before the order transition that justifies it',
        );
    }

    public function testTheAppRoleCannotMutateAnAppendOnlyTable(): void
    {
        $grants = $this->grantsTo('nastech_app');
        $this->driveMoneyPath();

        foreach (Schema::APPEND_ONLY_TABLES as $table) {
            $sqlName = Schema::TABLES[$table];
            $permissions = $grants[$sqlName] ?? '';

            $this->assertStringContains('INSERT', $permissions, "{$sqlName} must be insertable by the app role");
            $this->assertTrue(
                !str_contains($permissions, 'UPDATE') && !str_contains($permissions, 'DELETE'),
                sprintf(
                    '%s is append-only in the model but the app role holds %s. The trigger would still refuse '
                        . 'the write; the grant is the layer that refuses the attempt.',
                    $sqlName,
                    $permissions === '' ? '(nothing)' : $permissions,
                ),
            );
        }
    }

    public function testMutableTablesAreExactlyTheOnesExcludedFromAppendOnly(): void
    {
        // outbox_messages.delivered_at and payment_discrepancies.resolved_at are
        // written after the insert, by the dispatcher and by a human respectively. If
        // either ever appears in APPEND_ONLY_TABLES the delivery bookkeeping breaks —
        // and this is the test that says so before the migration does.
        $grants = $this->grantsTo('nastech_app');
        $mutable = ['catalogue.listings', 'orders.orders', 'handover.tokens', 'shared.outbox_messages', 'payments.payment_discrepancies'];

        foreach ($mutable as $sqlName) {
            $this->assertStringContains('UPDATE', $grants[$sqlName] ?? '', "{$sqlName} must stay updatable");
        }

        $appendOnlySql = array_map(
            static fn (string $t): string => Schema::TABLES[$t],
            Schema::APPEND_ONLY_TABLES,
        );
        $this->assertSame(10, count($appendOnlySql) + count($mutable));
    }

    public function testEveryNamedRowRuleIsInTheMigrationAndOnlyThoseAre(): void
    {
        $ddl = $this->migration('001');

        foreach (Schema::ROW_CHECKS as $sqlName => $expected) {
            $declared = $this->namedChecks($ddl, $sqlName);

            foreach ($expected as $constraint) {
                $this->assertTrue(
                    in_array($constraint, $declared, true),
                    sprintf(
                        '%s is required by Schema::ROW_CHECKS but the migration no longer declares it. '
                        . 'The rule is gone from production and from every test that reads rows.',
                        $constraint,
                    ),
                );
            }

            // The other direction, which is the one a reviewer never sees: a constraint
            // added straight to the SQL, so the model has no idea it exists and no PHP
            // path expects a write to be refused.
            foreach (array_diff($declared, $expected) as $extra) {
                $this->fail(
                    "{$sqlName}.{$extra} is declared in the migration but absent from Schema::ROW_CHECKS. "
                    . 'Either it belongs in the model too, or it is a column rule and should stay inline and unnamed.'
                );
            }
        }
    }

    public function testTheEnumeratedColumnsAllowExactlyWhatTheModelCanWrite(): void
    {
        // The row-level test in MoneyPathRowsSatisfyTheDdlChecksTest can only see the
        // values a run happens to produce. This compares the whole vocabulary, so the
        // two directions of the same mistake both fail: a state the DDL refuses, and a
        // state the DDL admits that nothing in PHP can interpret.
        //
        // Both were real here before the lists were transcribed. listings.status
        // declared DRAFT/REMOVED/EXPIRED and omitted RESERVED — so the first write of
        // a sale was refused by the database. provider_events.event_type declared a
        // payment.failed that the model has no type for, and omitted the chargeback
        // that it does.
        $ddl = $this->migration('001');

        $enums = [
            ['orders.orders', 'status', Order::class, static fn (string $n): bool => !str_starts_with($n, 'EV_')],
            ['catalogue.listings', 'status', Listing::class, static fn (): bool => true],
            ['payments.provider_events', 'event_type', WebhookEvent::class, static fn (string $n): bool => str_starts_with($n, 'TYPE_')],
            ['commissions.commission_entries', 'kind', CommissionEntry::class, static fn (string $n): bool => str_starts_with($n, 'KIND_')],
            ['settlements.ledger_entries', 'entry_type', Ledger::class, static fn (string $n): bool => str_starts_with($n, 'TYPE_')],
        ];

        foreach ($enums as [$table, $column, $class, $nameFilter]) {
            $declared = $this->ddlInList($ddl, $table, $column);
            $this->assertNotSame(null, $declared, "{$table}.{$column} has no IN (...) list in the DDL");

            $this->assertSame(
                self::vocabulary($class, $nameFilter),
                $declared,
                sprintf(
                    '%s.%s is an invented vocabulary. The IN list has to be transcribed from %s, '
                    . 'which is the only code that writes the column.',
                    $table,
                    $column,
                    $class,
                ),
            );
        }
    }

    // ------------------------------------------------------------------
    // Driving the path, to collect the columns actually written
    // ------------------------------------------------------------------

    /**
     * Runs the real money path far enough to touch every table, then reads back the
     * row shapes the store holds. Columns are derived from what the code actually
     * inserts, not from a list somebody maintains beside it.
     */
    private function driveMoneyPath(): void
    {
        if ($this->writtenColumns !== []) {
            return;
        }

        $fx = new MoneyFixture();

        $body = '{"event_id":"evt_parity","order_id":"' . $fx->orderId . '","type":"payment.captured","amount":"1299.00","currency":"ZAR"}';
        $timestamp = (string) $fx->clock->now()->getTimestamp();
        $fx->kernel->webhooks->verify($body, 'sha256=' . $fx->kernel->webhooks->sign($body, $timestamp), $timestamp);

        $fx->capture();
        // A second callback for a different amount takes the discrepancy branch.
        $fx->capture('1100.00');

        [$tokenId, $pin] = $fx->scheduledHandover();
        $fx->kernel->confirmHandover->handle($tokenId, 'buyer', $pin, MoneyFixture::BUYER);
        $fx->kernel->confirmHandover->handle($tokenId, 'seller', $pin, MoneyFixture::SELLER);
        $fx->kernel->completeOrder->handle($fx->orderId);

        $fx->kernel->requestPayout->handle(
            MoneyFixture::SELLER,
            Money::fromRand('10.00'),
            'po_parity',
            'acc_XXXX1234',
        );

        $captured = [];
        foreach (array_keys(Schema::TABLES) as $table) {
            foreach ($fx->kernel->store->all($table) as $row) {
                $keys = array_keys($row);
                $captured[$table] = array_values(array_unique(array_merge($captured[$table] ?? [], $keys)));
            }
        }

        $this->writtenColumns = $captured;
    }

    // ------------------------------------------------------------------
    // The DDL, read as text
    // ------------------------------------------------------------------

    /**
     * @return array<string, array{columns: array<string, array{not_null:bool, has_default:bool}>}>
     */
    private function ddlTables(): array
    {
        preg_match_all('/CREATE TABLE ([a-z_]+\.[a-z_]+) \((.*?)\n\);/s', $this->migration('001'), $matches, PREG_SET_ORDER);

        $tables = [];
        foreach ($matches as [$_, $name, $body]) {
            $columns = [];
            foreach (preg_split('/\r?\n/', $body) as $line) {
                $line = trim($line);
                if ($line === '' || $line === '(' || preg_match('/^(CONSTRAINT|CHECK|PRIMARY KEY|UNIQUE|FOREIGN|EXCLUDE)\b/i', $line)) {
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

    /** @return list<string> schema-qualified table names with an append-only trigger */
    private function appendOnlyTablesInDdl(): array
    {
        preg_match_all(
            '/CREATE TRIGGER\s+\w+\s+BEFORE UPDATE OR DELETE ON\s+([a-z_]+\.[a-z_]+)/',
            $this->migration('001'),
            $matches,
        );

        return $matches[1];
    }

    /** @return array<string, list<list<string>>> table => list of column lists */
    private function uniqueIndexesInDdl(): array
    {
        preg_match_all(
            '/CREATE UNIQUE INDEX\s+\w+\s+ON\s+([a-z_]+\.[a-z_]+)\s*\(([^)]*)\)/',
            $this->migration('001'),
            $matches,
            PREG_SET_ORDER,
        );

        $indexes = [];
        foreach ($matches as [$_, $table, $columnList]) {
            $columns = array_map(
                static fn (string $c): string => trim(strtolower(trim($c))),
                explode(',', $columnList),
            );
            $indexes[$table][] = $columns;
        }

        return $indexes;
    }

    /** @return array<string, string> table => the privileges granted to the role */
    private function grantsTo(string $role): array
    {
        $grants = [];
        preg_match_all('/GRANT\s+([^=]+?)\s+ON\s*\n?\s*([^;]+?)\s*TO\s+' . $role . '\s*;/s', $this->migration('002'), $matches, PREG_SET_ORDER);

        foreach ($matches as [$_, $privileges, $tableList]) {
            foreach (preg_split('/,\s*/', preg_replace('/\s+/', ' ', trim($tableList))) as $table) {
                $table = trim($table);
                if ($table === '' || !str_contains($table, '.')) {
                    continue;
                }
                $grants[$table] = trim(($grants[$table] ?? '') . ' ' . strtoupper($privileges));
            }
        }

        return $grants;
    }

    /**
     * @param callable(string): bool $nameFilter
     * @return list<string> the string constant values of $class, sorted
     */
    private static function vocabulary(string $class, callable $nameFilter): array
    {
        $values = [];
        foreach ((new \ReflectionClass($class))->getConstants() as $name => $value) {
            if (is_string($value) && $name !== 'TABLE' && $nameFilter($name)) {
                $values[] = $value;
            }
        }

        sort($values);

        // A vocabulary that is also a subset check: two constants with one value
        // (Order's EV_HANDOVER_SCHEDULED and its state of the same name) would
        // otherwise read as two allowed values.
        return array_values(array_unique($values));
    }

    /** @return ?string the CREATE TABLE body of one table, or null if there is none */
    private function tableBody(string $ddl, string $table): ?string
    {
        // Scoped to the table: two of the ten have a column named status, and an
        // unanchored search returns whichever comes first in the file while looking
        // exactly like it returned the right one.
        return preg_match(
            '/CREATE TABLE ' . preg_quote($table, '/') . ' \((.*?)\n\);/s',
            $ddl,
            $matches,
        ) === 1 ? $matches[1] : null;
    }

    /** @return list<string> the names of that table's named CHECK constraints */
    private function namedChecks(string $ddl, string $table): array
    {
        $body = $this->tableBody($ddl, $table);
        $this->assertNotSame(null, $body, "{$table} is in Schema::ROW_CHECKS but the migration never creates it");

        preg_match_all('/CONSTRAINT\s+([a-z_0-9]+)\s+CHECK\b/i', (string) $body, $found);

        return $found[1];
    }

    /** @return ?list<string> the values of the column's IN (...) list, sorted */
    private function ddlInList(string $ddl, string $table, string $column): ?array
    {
        $body = $this->tableBody($ddl, $table);
        if ($body === null) {
            return null;
        }

        if (preg_match('/\b' . $column . '\s+text[^,]*CHECK \(' . $column . ' IN \(([^)]*)\)/s', $body, $m) !== 1) {
            return null;
        }

        $values = [];
        if (preg_match_all("/'([^']*)'/", $m[1], $quoted) > 0) {
            $values = $quoted[1];
        }

        sort($values);

        return array_values(array_unique($values));
    }

    /** @return list<string> the first capture group of every match */
    private function matches(string $pattern, string $subject): array
    {
        preg_match_all($pattern, $subject, $matches);

        return $matches[1];
    }

    private function migration(string $which): string
    {
        $path = dirname(__DIR__, 2) . self::MIGRATIONS[$which];
        $contents = @file_get_contents($path);
        if ($contents === false) {
            $this->fail('migration is missing: ' . $path);
        }

        return $contents;
    }
}
