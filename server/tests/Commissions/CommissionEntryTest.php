<?php

declare(strict_types=1);

namespace NasTech\Tests\Commissions;

use NasTech\Commissions\CommissionEntry;
use NasTech\Commissions\CommissionIntegrityViolation;
use NasTech\Tests\Support\MoneyFixture;
use NasTech\Tests\TestCase;

/**
 * The row a commission entry is allowed to be, enforced by the entry itself.
 *
 * These are the same five rules the migration states as named CHECKs. They live in
 * the constructor because that is the narrowest place they can live: a row that does
 * not add up cannot be built, so no handler has to remember to look, and the
 * in-memory store — which has no CHECK support — refuses them anyway. Without this
 * layer the DDL is the only thing standing between a bad calculation and a seller
 * being shown a number that cannot be defended.
 */
final class CommissionEntryTest extends TestCase
{
    /** @var array<string, array<string,mixed>> kind => the row a real run wrote */
    private array $rows = [];

    public function testTheRowsARealRunWroteAreConstructible(): void
    {
        // The control. Guards that only ever fire are as useless as guards that never
        // fire, and this is the one that says the real shapes are not among the rejects.
        foreach (['FORWARD', 'REVERSAL'] as $kind) {
            $entry = CommissionEntry::fromRow($this->row($kind));
            $this->assertSame($kind, $entry->kind);
        }
    }

    public function testAForwardEntryThatDoesNotAddUpIsRefused(): void
    {
        $this->assertRefused(['seller_net_cents' => 100000], 'does not add up');
    }

    public function testAForwardEntryWithANegativeCommissionIsRefused(): void
    {
        $this->assertRefused(['commission_cents' => -9093, 'seller_net_cents' => 138993], 'negative forward commission');
    }

    public function testAReversalThatHandsBackMoneyIsRefused(): void
    {
        // A reversal with a positive commission is the double-payout shape: the
        // seller gets the take back twice, once as the refund and once as this row.
        $this->assertRefusedReversal(['commission_cents' => 9093], 'reverses a commission of');
    }

    public function testAForwardEntryCannotNameAnEntryItReverses(): void
    {
        $this->assertRefused(['reversal_of' => 'cme_something_else'], 'cannot reverse an entry');
    }

    public function testAReversalWithoutAParentIsRefused(): void
    {
        $this->assertRefusedReversal(['reversal_of' => null], 'must name the entry it reverses');
    }

    public function testACommissionThatMovedNoLedgerMoneyIsRefused(): void
    {
        $this->assertRefused(['ledger_entry_id' => null], 'with no ledger entry behind it');
    }

    // ------------------------------------------------------------------

    /**
     * @param array<string,mixed> $overrides
     */
    private function assertRefused(array $overrides, string $messageContains): void
    {
        $row = array_merge($this->row('FORWARD'), $overrides);

        $this->assertThrows(
            CommissionIntegrityViolation::class,
            static fn () => CommissionEntry::fromRow($row),
            $messageContains,
        );
    }

    /**
     * @param array<string,mixed> $overrides
     */
    private function assertRefusedReversal(array $overrides, string $messageContains): void
    {
        $row = array_merge($this->row('REVERSAL'), $overrides);

        $this->assertThrows(
            CommissionIntegrityViolation::class,
            static fn () => CommissionEntry::fromRow($row),
            $messageContains,
        );
    }

    /**
     * @return array<string,mixed>
     */
    private function row(string $kind): array
    {
        if ($this->rows === []) {
            $fx = new MoneyFixture();
            $fx->capture();
            // Refunded from PAID: COMPLETED is terminal, and the reversal row this
            // fixture needs is the one a refund writes.
            $fx->kernel->initiateRefund->handle($fx->orderId, 'goods not as described');
            $fx->kernel->settleRefund->handle($fx->orderId, 'goods not as described');

            foreach ($fx->kernel->store->all(CommissionEntry::TABLE) as $row) {
                $this->rows[(string) $row['kind']] = $row;
            }

            foreach (['FORWARD', 'REVERSAL'] as $expected) {
                $this->assertTrue(
                    isset($this->rows[$expected]),
                    "the run wrote no {$expected} commission row",
                );
            }
        }

        return $this->rows[$kind];
    }
}
