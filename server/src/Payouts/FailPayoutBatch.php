<?php

declare(strict_types=1);

namespace NasTech\Payouts;

use NasTech\Settlements\Ledger;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * A released payout failed at the bank. Give the money back to payable.
 *
 * The original PAYOUT row is never deleted or edited — it is evidence that the
 * instruction happened. The repair is a contra row through Settlements'
 * Ledger, linked by `reversal_of`, written in the same transaction as the batch
 * moving to FAILED. A retry is idempotent: the batch is already FAILED, so the
 * command returns without crediting twice.
 *
 * The Settlement ledger vocabulary (001_money_path.sql) has no
 * PAYOUT_REVERSAL type, and adding one would be an edit to another module.
 * SELLER_EARNINGS is the credit type that means "the seller is owed this
 * again"; the `reversal_of` pointer is what makes it unmistakably a payout
 * reversal rather than new trade. When the ledger grows a dedicated type, this
 * constant is the only line that changes.
 */
final class FailPayoutBatch
{
    public const EVENT_ATTEMPT_FAILED = 'PayoutAttemptFailed';

    private const REVERSAL_TYPE = Ledger::TYPE_SELLER_EARNINGS;

    public function __construct(
        private readonly UnitOfWork $uow,
        private readonly Ledger $ledger,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
        private readonly PayoutBatchRepository $batches,
    ) {
    }

    public function handle(string $batchId, string $reason): PayoutBatch
    {
        $this->uow->begin();

        try {
            $batch = $this->batches->require($batchId);

            if ($batch->isFailed()) {
                $this->uow->rollback();

                return $batch;
            }

            $batch->fail($reason, $this->clock->now());

            foreach ($batch->lines as $line) {
                if ($line->ledgerEntryId === null || $this->ledger->entry($line->ledgerEntryId) === null) {
                    throw new PayoutRefused(
                        PayoutRefused::LEDGER_ROW_MISSING,
                        sprintf('line %s has no PAYOUT row to reverse; refusing to invent one', $line->id),
                    );
                }

                $reversal = $this->ledger->record(
                    $line->sellerId,
                    $line->orderId,
                    self::REVERSAL_TYPE,
                    $line->amount,
                    sprintf('Payout %s failed, returned to payable: %s', $batch->payoutKey, $reason),
                    $line->ledgerEntryId,
                );
                $line->reversalLedgerEntryId = $reversal->id->value();
            }

            $this->batches->save($batch);

            $this->outbox->publish('PayoutBatch', $batch->id, self::EVENT_ATTEMPT_FAILED, [
                'batch_id' => $batch->id,
                'payout_key' => $batch->payoutKey,
                'reason' => $reason,
                'currency' => $batch->total->currency,
                'lines' => PreparePayoutBatch::linesPayload($batch),
            ]);

            $this->uow->commit();

            return $batch;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
