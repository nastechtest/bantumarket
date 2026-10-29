<?php

declare(strict_types=1);

namespace NasTech\Tests\Payouts;

use NasTech\Payouts\BankDestination;
use NasTech\Payouts\PayoutBatch;
use NasTech\Payouts\PayoutLine;
use NasTech\Payouts\PayoutRefused;
use NasTech\Payouts\SensitiveBankDetailRefused;
use NasTech\Settlements\Ledger;
use NasTech\Tests\Payouts\Support\PayoutsFixture;
use NasTech\Tests\Support\MoneyFixture;
use NasTech\Tests\TestCase;

/**
 * The payout rules, each reproduced against the real money path.
 *
 * The fixtures run a completed sale through the Kernel, so the balance a payout
 * spends is the ledger's balance and not a number invented by the test. Every
 * refusal asserts the reason code, not only that something failed: "refused"
 * with the wrong reason is a different rule firing, and in this module that is
 * the difference between protecting the seller and protecting the bug.
 */
final class PayoutsTest extends TestCase
{
    private PayoutsFixture $fx;

    public function setUp(): void
    {
        $this->fx = new PayoutsFixture();
    }

    public function testAPayoutLargerThanThePayableBalanceIsRefused(): void
    {
        $refusal = $this->assertThrows(
            PayoutRefused::class,
            fn () => $this->fx->prepare('po_over', 'stf_ana', [$this->fx->line(120_808)]),
            'over_payable_balance',
        );

        $this->assertSame(PayoutRefused::OVER_PAYABLE_BALANCE, $refusal->reason);
        $this->assertSame(120_807, $this->fx->balanceCents(), 'a refused payout must not touch the balance');
        $this->assertSame(0, $this->fx->batches->count(), 'and must not leave a batch behind');
    }

    public function testTheMakerCannotApproveTheBatchTheyPrepared(): void
    {
        $batch = $this->fx->prepare('po_maker', 'stf_ana', [$this->fx->line(10_000)]);

        $refusal = $this->assertThrows(
            PayoutRefused::class,
            fn () => $this->fx->approve->handle($batch->id, 'stf_ana'),
            'maker_cannot_approve',
        );

        $this->assertSame(PayoutRefused::MAKER_CANNOT_APPROVE, $refusal->reason);
        $this->assertSame(PayoutBatch::STATUS_PREPARED, $this->fx->batches->require($batch->id)->status);
        $this->assertSame([], $this->fx->payoutLedgerRows(), 'no ledger row exists for a batch nobody approved');
        $this->assertSame(120_807, $this->fx->balanceCents());
    }

    public function testARetryWithTheSameKeyIsTheSameBatch(): void
    {
        $first = $this->fx->prepare('po_same_key', 'stf_ana', [$this->fx->line(120_807)]);
        $retry = $this->fx->prepare('po_same_key', 'stf_ana', [$this->fx->line(120_807)]);

        $this->assertSame($first->id, $retry->id, 'the retry returns the batch the key already claimed');
        $this->assertSame(1, $this->fx->batches->count());
        $this->assertCount(1, $retry->lines, 'and does not duplicate the line');

        $this->fx->approve->handle($first->id, 'stf_ben');
        // The full balance is now spent. The retry must still be the same batch,
        // not an over-payout refusal judged against the post-payout balance.
        $afterRelease = $this->fx->prepare('po_same_key', 'stf_ana', [$this->fx->line(120_807)]);

        $this->assertSame(PayoutBatch::STATUS_RELEASED, $afterRelease->status);
        $this->assertCount(1, $this->fx->payoutLedgerRows(), 'a retry after release cannot produce a second PAYOUT row');
        $this->assertSame(0, $this->fx->balanceCents());
    }

    public function testASpentKeyWithDifferentMoneyIsRefused(): void
    {
        $this->fx->prepare('po_diff', 'stf_ana', [$this->fx->line(5_000)]);

        $refusal = $this->assertThrows(
            PayoutRefused::class,
            fn () => $this->fx->prepare('po_diff', 'stf_ana', [$this->fx->line(6_000)]),
            'payout_key_reused',
        );

        $this->assertSame(PayoutRefused::PAYOUT_KEY_REUSED, $refusal->reason);
    }

    public function testAnOrderInDisputeBlocksThePayout(): void
    {
        $this->fx->disputes->dispute($this->fx->money->orderId);

        $refusal = $this->assertThrows(
            PayoutRefused::class,
            fn () => $this->fx->prepare('po_disputed', 'stf_ana', [$this->fx->line(10_000)]),
            'order_in_dispute',
        );

        $this->assertSame(PayoutRefused::ORDER_IN_DISPUTE, $refusal->reason);
        $this->assertSame(0, $this->fx->batches->count());
        $this->assertSame(120_807, $this->fx->balanceCents(), 'the disputed money stays payable, not zeroed');
    }

    public function testANegativeBalanceIsRefusedAndNotZeroed(): void
    {
        // An operator tool, a migration, or a provider adjustment leaves the
        // seller overdrawn. RequestPayout's guard cannot see this because no
        // request exists; the balance is simply below zero.
        $this->fx->money->kernel->store->insert(Ledger::TABLE, [
            'id' => 'led_operator_debit',
            'seller_id' => MoneyFixture::SELLER,
            'order_id' => null,
            'entry_type' => Ledger::TYPE_CHARGEBACK,
            'amount_cents' => -200_000,
            'currency' => 'ZAR',
            'reason' => 'operator wrote a debit larger than the balance',
            'recorded_at' => '2026-11-02T09:30:00+02:00',
            'reversal_of' => null,
        ]);

        $refusal = $this->assertThrows(
            PayoutRefused::class,
            fn () => $this->fx->prepare('po_negative', 'stf_ana', [$this->fx->line(100)]),
            'negative_balance',
        );

        $this->assertSame(PayoutRefused::NEGATIVE_BALANCE, $refusal->reason);
        $this->assertSame(-79_193, $this->fx->balanceCents(), 'the negative balance is refused, never zeroed');
        $this->assertNotSame(null, $this->fx->money->kernel->store->find(Ledger::TABLE, 'led_operator_debit'));
    }

    public function testTheDestinationIsStoredMaskedOnly(): void
    {
        $batch = $this->fx->prepare(
            'po_masked',
            'stf_ana',
            [$this->fx->line(1_000, null, 'standard_bank', '9876')],
        );
        $line = $this->fx->batches->require($batch->id)->lines[0];
        $row = $this->fx->money->kernel->store->find(PayoutLine::TABLE, $line->id);

        $this->assertSame('standard_bank', $row['bank_brand']);
        $this->assertSame('9876', $row['bank_last_four']);
        $this->assertSame('Standard Bank •••• 9876', $line->destination->masked());
        $this->assertFalse(
            str_contains(json_encode($row, JSON_THROW_ON_ERROR), '9876543210'),
            'no column holds more than the brand and four digits',
        );
    }

    public function testAFullAccountNumberIsRefusedInEitherField(): void
    {
        $inBrand = $this->assertThrows(
            SensitiveBankDetailRefused::class,
            fn () => new BankDestination('1234567890', '1234'),
            'account_number',
        );
        $this->assertSame(SensitiveBankDetailRefused::ACCOUNT_NUMBER, $inBrand->kind);
        $this->assertSame('brand', $inBrand->field);

        $inLastFour = $this->assertThrows(
            SensitiveBankDetailRefused::class,
            fn () => new BankDestination('capitec', '1234567890'),
            'account_number',
        );
        $this->assertSame(SensitiveBankDetailRefused::ACCOUNT_NUMBER, $inLastFour->kind);
        $this->assertSame('last_four', $inLastFour->field);
    }

    public function testAnIdNumberIsRefused(): void
    {
        $refusal = $this->assertThrows(
            SensitiveBankDetailRefused::class,
            fn () => new BankDestination('9001015009087', '1234'),
            'id_number',
        );

        $this->assertSame(SensitiveBankDetailRefused::ID_NUMBER, $refusal->kind);
        $this->assertFalse(str_contains($refusal->getMessage(), '9001015009087'), 'a refusal never echoes the number');
    }

    public function testACardNumberIsRefused(): void
    {
        $grouped = $this->assertThrows(
            SensitiveBankDetailRefused::class,
            fn () => new BankDestination('4111 1111 1111 1111', '1234'),
            'card_number',
        );
        $this->assertSame(SensitiveBankDetailRefused::CARD_NUMBER, $grouped->kind);

        $inLastFour = $this->assertThrows(
            SensitiveBankDetailRefused::class,
            fn () => new BankDestination('fnb', '4111111111111111'),
            'card_number',
        );
        $this->assertSame(SensitiveBankDetailRefused::CARD_NUMBER, $inLastFour->kind);
        $this->assertSame('last_four', $inLastFour->field);
    }

    public function testASanctionedAccountIsRefused(): void
    {
        $account = $this->fx->accounts->require(MoneyFixture::SELLER);
        $account->suspend();
        $this->fx->accounts->save($account);

        $refusal = $this->assertThrows(
            PayoutRefused::class,
            fn () => $this->fx->prepare('po_sanctioned', 'stf_ana', [$this->fx->line(1_000)]),
            'account_sanctioned',
        );

        $this->assertSame(PayoutRefused::ACCOUNT_SANCTIONED, $refusal->reason);
        $this->assertSame(0, $this->fx->batches->count());
    }

    public function testApprovalWritesOnePayoutRowThatAgreesWithTheBatch(): void
    {
        $batch = $this->fx->prepare('po_agree', 'stf_ana', [$this->fx->line(120_807)]);
        $released = $this->fx->approve->handle($batch->id, 'stf_ben');

        $rows = $this->fx->payoutLedgerRows();
        $this->assertCount(1, $rows, 'one line, one debit');
        $this->assertSame(-120_807, (int) $rows[0]['amount_cents'], 'the ledger stores the debit signed');
        $this->assertSame($released->total->cents, abs((int) $rows[0]['amount_cents']), 'batch total and ledger agree to the cent');
        $this->assertSame($released->lines[0]->ledgerEntryId, (string) $rows[0]['id']);
        $this->assertSame(PayoutBatch::STATUS_RELEASED, $released->status);
        $this->assertSame('stf_ben', $released->approvedBy);
        $this->assertStringContains('Payout po_agree to Capitec', (string) $rows[0]['reason']);
        $this->assertSame(0, $this->fx->balanceCents(), 'the payable balance is exactly spent');
    }

    public function testApprovingTheSameBatchTwiceDoesNotPayTwice(): void
    {
        $batch = $this->fx->prepare('po_twice', 'stf_ana', [$this->fx->line(10_000)]);
        $this->fx->approve->handle($batch->id, 'stf_ben');
        $this->fx->approve->handle($batch->id, 'stf_ben');

        $this->assertCount(1, $this->fx->payoutLedgerRows());
        $this->assertSame(110_807, $this->fx->balanceCents());
    }

    public function testAFailedPayoutRestoresTheBalanceWithItsOwnLedgerRow(): void
    {
        $batch = $this->fx->prepare('po_fail', 'stf_ana', [$this->fx->line(120_807)]);
        $released = $this->fx->approve->handle($batch->id, 'stf_ben');
        $payoutEntryId = (string) $released->lines[0]->ledgerEntryId;
        $countAfterRelease = $this->fx->money->kernel->ledger->count();

        $failed = $this->fx->fail->handle($batch->id, 'beneficiary account closed');

        $this->assertSame(PayoutBatch::STATUS_FAILED, $failed->status);
        $this->assertSame(120_807, $this->fx->balanceCents(), 'the money is payable again');
        $this->assertSame($countAfterRelease + 1, $this->fx->money->kernel->ledger->count(), 'one new row, not an edit');

        $stored = $this->fx->batches->require($batch->id);
        $reversal = $this->fx->money->kernel->ledger->entry((string) $stored->lines[0]->reversalLedgerEntryId);
        $this->assertNotSame(null, $reversal);
        $this->assertSame($payoutEntryId, $reversal->reversalOf, 'the credit points at the payout it reverses');
        $this->assertSame(120_807, $reversal->amount->cents);
        $this->assertNotSame(
            null,
            $this->fx->money->kernel->ledger->entry($payoutEntryId),
            'the original PAYOUT row is never deleted',
        );
    }

    public function testAFailedPayoutCannotBeReversedTwice(): void
    {
        $batch = $this->fx->prepare('po_fail_twice', 'stf_ana', [$this->fx->line(10_000)]);
        $this->fx->approve->handle($batch->id, 'stf_ben');
        $this->fx->fail->handle($batch->id, 'bank timeout');
        $countAfterFirstFailure = $this->fx->money->kernel->ledger->count();

        $this->fx->fail->handle($batch->id, 'bank timeout');

        $this->assertSame($countAfterFirstFailure, $this->fx->money->kernel->ledger->count());
        $this->assertSame(120_807, $this->fx->balanceCents(), 'retrying the failure does not credit the seller twice');
    }

    public function testAnUnapprovedBatchCannotBeReversed(): void
    {
        $batch = $this->fx->prepare('po_not_released', 'stf_ana', [$this->fx->line(10_000)]);

        $refusal = $this->assertThrows(
            PayoutRefused::class,
            fn () => $this->fx->fail->handle($batch->id, 'bank rejected'),
            'invalid_state',
        );

        $this->assertSame(PayoutRefused::INVALID_STATE, $refusal->reason);
        $this->assertSame(PayoutBatch::STATUS_PREPARED, $this->fx->batches->require($batch->id)->status);
    }

    public function testTheApprovalRechecksTheBalanceRatherThanTrustingPrepareTime(): void
    {
        $batch = $this->fx->prepare('po_stale', 'stf_ana', [$this->fx->line(100_000)]);

        // A different batch spends most of the balance before this one is checked.
        $earlier = $this->fx->prepare('po_earlier', 'stf_ada', [$this->fx->line(120_000)]);
        $this->fx->approve->handle($earlier->id, 'stf_ben');

        $refusal = $this->assertThrows(
            PayoutRefused::class,
            fn () => $this->fx->approve->handle($batch->id, 'stf_ben'),
            'over_payable_balance',
        );

        $this->assertSame(PayoutRefused::OVER_PAYABLE_BALANCE, $refusal->reason);
        $this->assertSame(PayoutBatch::STATUS_PREPARED, $this->fx->batches->require($batch->id)->status);
        $this->assertSame(807, $this->fx->balanceCents(), 'the earlier approved batch is the only money that left');
    }

    public function testABatchToStringIsTheMaskedDestinationOnly(): void
    {
        $destination = new BankDestination('capitec', '4321');

        $this->assertSame('Capitec •••• 4321', $destination->masked());
        $this->assertSame(['bank_brand' => 'capitec', 'bank_last_four' => '4321'], $destination->toRow());
    }
}
