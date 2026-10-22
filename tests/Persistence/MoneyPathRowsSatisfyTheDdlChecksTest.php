<?php

declare(strict_types=1);

namespace NasTech\Tests\Persistence;

use NasTech\Commissions\CommissionEntry;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Persistence\Schema;
use NasTech\Tests\Support\DdlRowChecks;
use NasTech\Tests\Support\MoneyFixture;
use NasTech\Tests\Support\UnsupportedCheck;
use NasTech\Tests\TestCase;

/**
 * The migration's row CHECKs, run against the rows the money path really writes.
 *
 * SchemaParityTest proves the DDL and the model declare the same tables, columns and
 * indexes. It cannot see the body of a CHECK, which is where the subtler divergence
 * lives: a constraint can be present, correctly named, and still reject a row the
 * application produced on purpose. `CHECK (commission_cents >= 0)` on
 * commissions.commission_entries is that constraint — a reversal carries a negative
 * commission by design, so the rule that reads like a tightening is a refund that
 * cannot commit. Nothing in the PHP suite notices, because the in-memory store has no
 * CHECK support to fail on.
 *
 * This is the closest thing available to running the migration. It is not a
 * replacement: triggers, functions, deferrability and exclusion constraints still
 * need a real server, and that is an open item.
 */
final class MoneyPathRowsSatisfyTheDdlChecksTest extends TestCase
{
    /**
     * Tables allowed to carry no row-level CHECK.
     *
     * seen_webhook_signatures is the one: an id, a signature and a timestamp. Its
     * whole rule is the unique index on the signature, which is a constraint on the
     * set of rows rather than a predicate on one. A new table that declares nothing
     * has to be added here, which is the point — the question gets asked rather than
     * the absence going unnoticed.
     *
     * @var list<string>
     */
    private const NO_ROW_CHECKS_EXPECTED = ['payments.seen_webhook_signatures'];

    /** @var array<string, list<array<string,mixed>>> table => rows written by the path */
    private array $written = [];

    public function testEveryRowTheMoneyPathWritesSatisfiesEveryCheckOnItsTable(): void
    {
        $ddl = $this->migration();
        // Assigned before the loop, not read from the property: touching $this->written
        // here would be an empty array until the path has run, and the whole test would
        // iterate nothing and report green.
        $written = $this->written();

        foreach (array_keys(Schema::TABLES) as $table) {
            $sqlName = Schema::TABLES[$table];
            $checks = DdlRowChecks::checksIn($ddl, $sqlName);
            $rows = $written[$table] ?? [];

            $this->assertTrue(
                count($rows) > 0,
                sprintf('%s has no row from the money path, so its %d checks were read but never run', $sqlName, count($checks)),
            );

            $this->assertTrue(
                $checks !== [] || in_array($sqlName, self::NO_ROW_CHECKS_EXPECTED, true),
                sprintf(
                    '%s declares no row-level CHECK and is not on the allowed list. Either the table '
                    . 'lost a rule, or the rules belong in it and nobody wrote them.',
                    $sqlName,
                ),
            );

            foreach ($rows as $index => $row) {
                foreach ($checks as $check) {
                    $this->assertTrue(
                        DdlRowChecks::passes($check['expression'], $row),
                        sprintf(
                            '%s.%s rejects row %d that the money path wrote. %s',
                            $sqlName,
                            $check['name'],
                            $index,
                            self::describe($row),
                        ),
                    );
                }
            }
        }
    }

    public function testTheCommissionTableIsProvedOverBothKindsOfRow(): void
    {
        // Narrower than the test above and deliberately so: the bug this file exists
        // for is specific, and a guard written for the shape that broke keeps it from
        // coming back as an accident.
        $kinds = array_map(
            static fn (array $row): string => (string) $row['kind'],
            $this->written()['commission_entries'] ?? [],
        );

        $this->assertTrue(
            in_array(CommissionEntry::KIND_FORWARD, $kinds, true),
            'no forward commission row was written',
        );
        $this->assertTrue(
            in_array(CommissionEntry::KIND_REVERSAL, $kinds, true),
            'the run never refunded, so the reversal row shape went unchecked',
        );
    }

    public function testTheTwoChecksThisFileWasWrittenForWouldHaveFailedTheReversal(): void
    {
        $reversal = $this->rowOfKind(CommissionEntry::KIND_REVERSAL);
        $this->assertNotSame(null, $reversal, 'no reversal row to test against');

        // The pre-fix forms. Asserting against these expressions rather than the file
        // alone means the proof does not depend on anyone remembering the history.
        $this->assertFalse(
            DdlRowChecks::passes('commission_cents >= 0', $reversal),
            'an unguarded non-negative rule was expected to reject a reversal',
        );
        $this->assertFalse(
            DdlRowChecks::passes('gross_cents - commission_cents = seller_net_cents', $reversal),
            'the gross-less-commission identity was expected not to close on a reversal',
        );

        // And the migration must not contain them any more, in that unguarded shape.
        $ddl = $this->migration();
        $this->assertStringContains(
            "kind <> 'FORWARD' OR gross_cents - commission_cents = seller_net_cents",
            $ddl,
            'the identity is asserted only where it holds',
        );
        $this->assertTrue(
            !preg_match('/CHECK \(commission_cents >= 0\)/', $ddl),
            'an unguarded CHECK (commission_cents >= 0) is back in the migration',
        );
    }

    public function testTheEvaluatorRefusesWhatItCannotReadRatherThanPassingIt(): void
    {
        // Without this, a CHECK nobody modelled would read as a CHECK that passed.
        $row = ['commission_cents' => 100, 'reason' => 'a reason'];

        foreach ([
            'EXISTS (SELECT 1 FROM orders.orders)' => 'exists',
            "length(coalesce(reason, '')) > 0" => 'coalesce',
            "to_char(now(), 'YYYY') = '2026'" => 'to_char',
            "reason LIKE 'a%'" => 'pattern matching',
            'unknown_column = 100' => 'not in the row',
            'commission_cents => 5' => 'unexpected op',
        ] as $expression => $needle) {
            $this->assertThrows(
                UnsupportedCheck::class,
                static fn () => DdlRowChecks::evaluate($expression, $row),
                $needle,
            );
        }
    }

    public function testANullColumnSatisfiesACheckTheWayPostgresDoes(): void
    {
        // Postgres treats a CHECK that evaluates to NULL as satisfied, because the
        // expression is unknown rather than false. A naive boolean evaluator would
        // report false and the suite would start failing on rules the database accepts.
        $this->assertSame(
            null,
            DdlRowChecks::evaluate('commission_cents >= 0', ['commission_cents' => null]),
            'a comparison against NULL is unknown, not false',
        );
        $this->assertTrue(
            DdlRowChecks::passes('commission_cents >= 0', ['commission_cents' => null]),
            'unknown passes in Postgres',
        );

        // IS NULL is the exception: it always answers.
        $this->assertTrue(
            DdlRowChecks::evaluate('reversal_of IS NULL', ['reversal_of' => null]) === true,
            'IS NULL must not inherit the NULL of its operand',
        );

        // AND/OR are Kleene, not short-circuit-on-unknown.
        $this->assertSame(
            true,
            DdlRowChecks::evaluate("kind = 'FORWARD' OR gross_cents > 0", ['kind' => 'FORWARD', 'gross_cents' => null]),
            'true OR unknown is true',
        );
        $this->assertSame(
            null,
            DdlRowChecks::evaluate("kind = 'REVERSAL' AND gross_cents > 0", ['kind' => 'REVERSAL', 'gross_cents' => null]),
            'true AND unknown is unknown',
        );
    }

    // ------------------------------------------------------------------

    /**
     * @return array<string, list<array<string,mixed>>>
     */
    private function written(): array
    {
        if ($this->written !== []) {
            return $this->written;
        }

        $captured = [];
        foreach ($this->paths() as $fx) {
            foreach (array_keys(Schema::TABLES) as $table) {
                foreach ($fx->kernel->store->all($table) as $row) {
                    $captured[$table][] = $row;
                }
            }
        }

        $this->written = $captured;

        return $this->written;
    }

    /**
     * Two runs, because a refunded order can never be paid out and a paid-out seller
     * can never be refunded: the balance the second action would need is gone. One
     * fixture would leave either the reversal rows or the payout row untested, and the
     * row that goes untested is the row the wrong CHECK hides behind.
     *
     * @return list<MoneyFixture>
     */
    private function paths(): array
    {
        $settled = new MoneyFixture();

        $body = '{"event_id":"evt_ddl","order_id":"' . $settled->orderId . '","type":"payment.captured","amount":"1299.00","currency":"ZAR"}';
        $timestamp = (string) $settled->clock->now()->getTimestamp();
        $settled->kernel->webhooks->verify($body, 'sha256=' . $settled->kernel->webhooks->sign($body, $timestamp), $timestamp);

        $settled->capture();
        // A second callback for a different amount takes the discrepancy branch, which
        // is the only thing that writes a payment_discrepancies row.
        $settled->capture('1100.00');

        [$tokenId, $pin] = $settled->scheduledHandover();
        $settled->kernel->confirmHandover->handle($tokenId, 'buyer', $pin, MoneyFixture::BUYER);
        $settled->kernel->confirmHandover->handle($tokenId, 'seller', $pin, MoneyFixture::SELLER);
        $settled->kernel->completeOrder->handle($settled->orderId);

        $settled->kernel->requestPayout->handle(
            MoneyFixture::SELLER,
            Money::fromRand('5.00'),
            'po_ddl',
            'acc_XXXX1234',
        );

        $refunded = new MoneyFixture();
        $refunded->capture();

        // From PAID, not COMPLETED: completion is a terminal state, and a sale that
        // has been handed over and closed is not the refund this run is here to write.
        $refunded->kernel->initiateRefund->handle($refunded->orderId, 'goods not as described');
        $refunded->kernel->settleRefund->handle($refunded->orderId, 'goods not as described');

        return [$settled, $refunded];
    }

    /**
     * @return ?array<string,mixed>
     */
    private function rowOfKind(string $kind): ?array
    {
        foreach ($this->written()['commission_entries'] ?? [] as $row) {
            if ((string) $row['kind'] === $kind) {
                return $row;
            }
        }

        return null;
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
        $path = dirname(__DIR__, 2) . '/db/migrations/001_money_path.sql';
        $contents = @file_get_contents($path);
        if ($contents === false) {
            $this->fail('migration is missing: ' . $path);
        }

        return $contents;
    }
}
