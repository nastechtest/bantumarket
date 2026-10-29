<?php

declare(strict_types=1);

namespace NasTech\Payouts;

use NasTech\Identity\AccountRepository;
use NasTech\Settlements\Ledger;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Prepare a payout batch. No money moves here.
 *
 * Preparation is where every eligibility question is asked and answered with a
 * named refusal:
 *
 *  - the seller has a real, active account (Identity says who may be paid);
 *  - none of the orders is in dispute (the port says what is being argued);
 *  - the seller's ledger balance is not negative (a corrupted/overdrawn
 *    balance is refused, never zeroed to make the batch look payable);
 *  - the batch total for each seller does not exceed that balance, measured
 *    from Settlements' ledger at this instant.
 *
 * The one storage property that makes a retry safe is the unique index on
 * `payout_key`. The request digest distinguishes a retry (same key, same money)
 * from a key reused for a different payout, which is refused rather than
 * silently returning the old batch.
 */
final class PreparePayoutBatch
{
    public const EVENT_BUILT = 'PayoutBatchBuilt';

    public function __construct(
        private readonly UnitOfWork $uow,
        private readonly Ledger $ledger,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
        private readonly AccountRepository $accounts,
        private readonly OrderDisputes $disputes,
        private readonly PayoutBatchRepository $batches,
    ) {
    }

    /**
     * @param list<PayoutLineRequest> $requests
     */
    public function handle(string $payoutKey, string $preparedBy, array $requests): PayoutBatch
    {
        if (trim($payoutKey) === '') {
            throw new PayoutRefused(PayoutRefused::INVALID_STATE, 'a payout batch needs an idempotency key');
        }
        if (trim($preparedBy) === '') {
            throw new PayoutRefused(PayoutRefused::MISSING_PREPARER, 'a payout batch names the maker');
        }
        if ($requests === []) {
            throw new PayoutRefused(PayoutRefused::EMPTY_BATCH, 'an empty batch moves nothing');
        }

        $batchId = Id::generate('pbt')->value();
        $lines = [];
        $seenOrders = [];
        foreach ($requests as $request) {
            if (!$request->amount->isPositive()) {
                throw new PayoutRefused(
                    PayoutRefused::INVALID_AMOUNT,
                    sprintf('order %s asked for %s; a payout line is a positive amount',
                        $request->orderId, $request->amount->toRandString()),
                );
            }
            if (isset($seenOrders[$request->orderId])) {
                throw new PayoutRefused(
                    PayoutRefused::DUPLICATE_ORDER,
                    sprintf('order %s appears twice in one batch; two lines would pay it twice', $request->orderId),
                );
            }
            $seenOrders[$request->orderId] = true;

            $lines[] = new PayoutLine(
                id: Id::generate('ply')->value(),
                batchId: $batchId,
                sellerId: $request->sellerId,
                orderId: $request->orderId,
                amount: $request->amount,
                destination: new BankDestination($request->bankBrand, $request->bankLastFour),
                oldestPayableAt: $request->oldestPayableAt,
            );
        }

        $digest = self::digest($lines);
        $total = self::total($lines);

        // A retry of a *committed* batch must answer with that batch even when
        // the first attempt already spent the balance — the balance check below
        // would otherwise refuse the retry of a full-balance payout. This read
        // is not what makes the key idempotent (the unique index is); it only
        // keeps the retry from being judged by the post-payout balance.
        $alreadyClaimed = $this->batches->findByKey($payoutKey);
        if ($alreadyClaimed !== null) {
            return $this->sameRequest($alreadyClaimed, $payoutKey, $digest);
        }

        $this->uow->begin();

        try {
            $this->assertEligible($lines);
            $this->assertWithinPayableBalance($lines);

            $batch = new PayoutBatch(
                id: $batchId,
                payoutKey: $payoutKey,
                requestDigest: $digest,
                status: PayoutBatch::STATUS_PREPARED,
                preparedBy: $preparedBy,
                approvedBy: null,
                total: $total,
                lines: $lines,
                preparedAt: $this->clock->now(),
            );

            $this->batches->save($batch);

            $this->outbox->publish('PayoutBatch', $batch->id, self::EVENT_BUILT, [
                'batch_id' => $batch->id,
                'payout_key' => $batch->payoutKey,
                'prepared_by' => $batch->preparedBy,
                'currency' => $batch->total->currency,
                'lines' => self::linesPayload($batch),
            ]);

            $this->uow->commit();

            return $batch;
        } catch (UniqueConstraintViolation $duplicate) {
            $this->uow->rollback();

            $existing = $this->batches->findByKey($payoutKey);
            if ($existing === null) {
                // The claim was on some other unique index; do not disguise a bug
                // as idempotency.
                throw $duplicate;
            }

            return $this->sameRequest($existing, $payoutKey, $digest);
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    private function sameRequest(PayoutBatch $existing, string $payoutKey, string $digest): PayoutBatch
    {
        if (!hash_equals($existing->requestDigest, $digest)) {
            throw new PayoutRefused(
                PayoutRefused::PAYOUT_KEY_REUSED,
                sprintf('payout key %s is already spent on batch %s with different lines', $payoutKey, $existing->id),
            );
        }

        return $existing;
    }

    /**
     * @param list<PayoutLine> $lines
     */
    private function assertEligible(array $lines): void
    {
        foreach ($lines as $line) {
            if ($this->disputes->isInDispute($line->orderId)) {
                throw new PayoutRefused(
                    PayoutRefused::ORDER_IN_DISPUTE,
                    sprintf('order %s is in dispute; its money stays payable until the case closes', $line->orderId),
                );
            }

            $account = $this->accounts->find($line->sellerId);
            if ($account === null) {
                throw new PayoutRefused(
                    PayoutRefused::UNKNOWN_ACCOUNT,
                    sprintf('seller %s has no account; money may not leave to an unidentified holder', $line->sellerId),
                );
            }
            if (!$account->isActive()) {
                throw new PayoutRefused(
                    PayoutRefused::ACCOUNT_SANCTIONED,
                    sprintf('seller %s is %s; a sanctioned account is not paid out', $line->sellerId, $account->status),
                );
            }
        }
    }

    /**
     * @param list<PayoutLine> $lines
     */
    private function assertWithinPayableBalance(array $lines): void
    {
        foreach (self::totalsPerSeller($lines) as $sellerId => $cents) {
            $balance = $this->ledger->sellerBalance($sellerId);

            if ($balance->isNegative()) {
                throw new PayoutRefused(
                    PayoutRefused::NEGATIVE_BALANCE,
                    sprintf(
                        'seller %s has a ledger balance of %s; a negative balance is refused, never zeroed',
                        $sellerId,
                        $balance->toRandString(),
                    ),
                );
            }

            if ($cents > $balance->cents) {
                throw new PayoutRefused(
                    PayoutRefused::OVER_PAYABLE_BALANCE,
                    sprintf(
                        'batch asks %s for seller %s but the payable ledger balance is %s',
                        Money::fromCents($cents)->toRandString(),
                        $sellerId,
                        $balance->toRandString(),
                    ),
                );
            }
        }
    }

    /**
     * @param list<PayoutLine> $lines
     * @return array<string,int>
     */
    private static function totalsPerSeller(array $lines): array
    {
        $totals = [];
        foreach ($lines as $line) {
            $totals[$line->sellerId] = ($totals[$line->sellerId] ?? 0) + $line->amount->cents;
        }

        return $totals;
    }

    /**
     * @param list<PayoutLine> $lines
     */
    private static function total(array $lines): Money
    {
        $total = Money::zero();
        foreach ($lines as $line) {
            $total = $total->add($line->amount);
        }

        return $total;
    }

    /**
     * Stable across a retry and sensitive to every fact that changes what is
     * paid. Sorted so the caller's line order is not part of the key.
     *
     * @param list<PayoutLine> $lines
     */
    private static function digest(array $lines): string
    {
        $facts = [];
        foreach ($lines as $line) {
            $facts[] = implode('|', [
                $line->sellerId,
                $line->orderId,
                (string) $line->amount->cents,
                $line->destination->brand->value,
                $line->destination->lastFour,
                $line->oldestPayableAt->format(\DateTimeInterface::ATOM),
            ]);
        }
        sort($facts);

        return hash('sha256', implode("\n", $facts));
    }

    /**
     * The shape Reporting's PayoutLatency reads: per-line seller, amount and
     * oldest payable date. A batch total alone cannot answer "how long did a
     * seller wait".
     *
     * @return list<array{seller_id:string, amount_cents:int, oldest_payable_at:string}>
     */
    public static function linesPayload(PayoutBatch $batch): array
    {
        $lines = [];
        foreach ($batch->lines as $line) {
            $lines[] = [
                'seller_id' => $line->sellerId,
                'amount_cents' => $line->amount->cents,
                'oldest_payable_at' => $line->oldestPayableAt->format(\DateTimeInterface::ATOM),
            ];
        }

        return $lines;
    }
}
