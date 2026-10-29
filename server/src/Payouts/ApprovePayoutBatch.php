<?php

declare(strict_types=1);

namespace NasTech\Payouts;

use NasTech\Settlements\Ledger;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * The checker's command: approve a prepared batch and move its money, or do
 * neither.
 *
 * This is the transaction the brief calls "the ledger and the payout agree".
 * The batch status change and every PAYOUT row commit together, through
 * Settlements' Ledger, inside one unit of work. If the ledger refuses a row —
 * an overdrawn balance, a missing transaction — the batch stays PREPARED and
 * no money has left.
 *
 * The payable balance is measured again here, not trusted from prepare time.
 * Another payout may have been approved in between, and a batch built against
 * yesterday's balance is exactly how a seller gets paid twice.
 */
final class ApprovePayoutBatch
{
    public const EVENT_RELEASED = 'PayoutBatchReleased';

    public function __construct(
        private readonly UnitOfWork $uow,
        private readonly Ledger $ledger,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
        private readonly PayoutBatchRepository $batches,
    ) {
    }

    public function handle(string $batchId, string $approverId): PayoutBatch
    {
        $this->uow->begin();

        try {
            $batch = $this->batches->require($batchId);

            // A retry of an approval that already committed is the same answer,
            // not a second payment.
            if ($batch->isReleased()) {
                $this->uow->rollback();

                return $batch;
            }

            // Refuses the preparer and anything that is not PREPARED, before a
            // ledger row exists.
            $batch->approve($approverId, $this->clock->now());

            $this->assertWithinPayableBalance($batch);

            foreach ($batch->lines as $line) {
                $entry = $this->ledger->record(
                    $line->sellerId,
                    $line->orderId,
                    Ledger::TYPE_PAYOUT,
                    $line->amount,
                    sprintf('Payout %s to %s', $batch->payoutKey, $line->destination->masked()),
                );
                $line->ledgerEntryId = $entry->id->value();
            }

            $this->batches->save($batch);

            $this->outbox->publish('PayoutBatch', $batch->id, self::EVENT_RELEASED, [
                'batch_id' => $batch->id,
                'payout_key' => $batch->payoutKey,
                'approved_by' => $batch->approvedBy,
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

    private function assertWithinPayableBalance(PayoutBatch $batch): void
    {
        $totals = [];
        foreach ($batch->lines as $line) {
            $totals[$line->sellerId] = ($totals[$line->sellerId] ?? 0) + $line->amount->cents;
        }

        foreach ($totals as $sellerId => $cents) {
            $balance = $this->ledger->sellerBalance($sellerId);

            if ($balance->isNegative()) {
                throw new PayoutRefused(
                    PayoutRefused::NEGATIVE_BALANCE,
                    sprintf(
                        'seller %s has a ledger balance of %s at approval; refusing to release batch %s',
                        $sellerId,
                        $balance->toRandString(),
                        $batch->id,
                    ),
                );
            }

            if ($cents > $balance->cents) {
                throw new PayoutRefused(
                    PayoutRefused::OVER_PAYABLE_BALANCE,
                    sprintf(
                        'batch %s asks %s for seller %s but the payable ledger balance is now %s',
                        $batch->id,
                        Money::fromCents($cents)->toRandString(),
                        $sellerId,
                        $balance->toRandString(),
                    ),
                );
            }
        }
    }
}
