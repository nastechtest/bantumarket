<?php

declare(strict_types=1);

namespace NasTech\Settlements;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;
use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;

/**
 * Move money out to a seller.
 *
 * The available balance is never stored, so this cannot decrement anything and
 * therefore cannot go wrong by decrementing twice. What it does is append a
 * PAYOUT row and then ask the commit guard whether the ledger still supports a
 * non-negative balance. Retrying this request with the same idempotency key is a
 * no-op by unique index, not by a lookup that could race with itself.
 */
final class RequestPayout
{
    public const TABLE = 'payout_requests';

    public function __construct(
        private readonly Store $store,
        private readonly UnitOfWork $uow,
        private readonly Ledger $ledger,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(string $sellerId, Money $amount, string $idempotencyKey, string $bankAccountRef): bool
    {
        $this->uow->begin();

        try {
            if (!$amount->isPositive()) {
                throw new PayoutRejected('A payout must be a positive amount');
            }

            $claimed = $this->claim($sellerId, $amount, $idempotencyKey, $bankAccountRef);
            if (!$claimed) {
                $this->uow->rollback();

                return false;
            }

            $balance = $this->ledger->sellerBalance($sellerId);
            if ($amount->gt($balance)) {
                throw new PayoutRejected(sprintf(
                    'Payout of %s exceeds the ledger balance of %s for seller %s. '
                    . 'Held or unconfirmed earnings are not payable.',
                    $amount->toRandString(),
                    $balance->toRandString(),
                    $sellerId,
                ));
            }

            // A payout is not tied to one order, so it carries no order reference.
            // The idempotency key above is what makes the row unrepeatable.
            $this->ledger->record($sellerId, null, Ledger::TYPE_PAYOUT, $amount, 'Payout to ' . $bankAccountRef);

            $this->outbox->publish('Seller', $sellerId, 'PayoutRequested', [
                'amount' => $amount->toRandString(),
                'idempotency_key' => $idempotencyKey,
                'remaining_balance' => $balance->subtract($amount)->toRandString(),
            ]);

            $this->uow->commit();

            return true;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    /**
     * false means this key has already been spent in a committed transaction.
     */
    private function claim(string $sellerId, Money $amount, string $idempotencyKey, string $bankAccountRef): bool
    {
        try {
            $this->store->insert(self::TABLE, [
                'id' => Id::generate('pyr')->value(),
                'idempotency_key' => $idempotencyKey,
                'seller_id' => $sellerId,
                'amount_cents' => $amount->cents,
                'currency' => $amount->currency,
                'bank_account_ref' => $bankAccountRef,
                'requested_at' => $this->clock->now()->format(\DateTimeInterface::ATOM),
            ]);

            return true;
        } catch (UniqueConstraintViolation) {
            // The key is already spent. Narrow catch on purpose: telling a seller
            // "you already requested this payout" when the real cause was a bug
            // would be a lie, and a swallowed bug here is a payout that silently
            // never happens.
            return false;
        }
    }
}
