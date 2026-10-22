<?php

declare(strict_types=1);

namespace NasTech\Tests\MoneyPath;

use NasTech\Orders\Order;
use NasTech\Payments\WebhookEvent;
use NasTech\Settlements\Ledger;
use NasTech\Settlements\LedgerIntegrityViolation;
use NasTech\Settlements\PayoutRejected;
use NasTech\SharedKernel\IllegalTransition;
use NasTech\SharedKernel\Money;
use NasTech\Tests\Support\MoneyFixture;
use NasTech\Tests\TestCase;

/**
 * The five failure modes named in 03-nastech-market.modules.dot.
 *
 * Each is reproduced here by writing the buggy handler on purpose — the code a
 * competent engineer might plausibly ship — and asserting that the commit refuses
 * it. A test that only exercises the correct handler proves the happy path; these
 * prove the guard.
 */
final class InvariantTest extends TestCase
{
    private MoneyFixture $fx;

    public function setUp(): void
    {
        $this->fx = new MoneyFixture();
    }

    /**
     * cluster_warning: "order marked paid without a CommissionEntry".
     */
    public function testAMarkedPaidOrderWithoutAnyLedgerRowIsRolledBack(): void
    {
        $kernel = $this->fx->kernel;
        $orderId = $this->fx->orderId;

        $buggy = static function () use ($kernel, $orderId): void {
            $kernel->uow->begin();
            $order = $kernel->orders->require($orderId);
            $order->apply(Order::EV_PAYMENT_RECORDED);
            $order->paidAt = $kernel->clock->now();
            $kernel->orders->save($order);
            // The omission: no ledger row, because the payment "will be booked by
            // the settlement job a minute later". Note that this handler registers
            // no guard at all — the invariant has to hold anyway.
            $kernel->uow->commit();
        };

        $this->assertThrows(
            LedgerIntegrityViolation::class,
            $buggy,
            'with no ledger row at all',
        );
        $this->assertSame('AWAITING_PAYMENT', $this->fx->orderStatus(), 'the order must not be paid');
        $this->assertSame(0, $this->fx->ledgerCount());
    }

    /**
     * cluster_warning: "order marked paid without a CommissionEntry" — the money
     * row exists but the pricing evidence does not.
     */
    public function testAPaidOrderWithLedgerButNoCommissionEvidenceIsRolledBack(): void
    {
        $kernel = $this->fx->kernel;
        $orderId = $this->fx->orderId;

        $buggy = static function () use ($kernel, $orderId): void {
            $kernel->uow->begin();
            $order = $kernel->orders->require($orderId);
            $order->apply(Order::EV_PAYMENT_RECORDED);
            $kernel->orders->save($order);
            $kernel->ledger->record(
                $order->sellerId,
                $order->id,
                Ledger::TYPE_SELLER_EARNINGS,
                $order->itemPrice,
                'Buyer payment captured',
            );
            // The omission: commission never charged, so the platform has credited
            // the seller the whole sale price and taken nothing.
            $kernel->uow->commit();
        };

        $this->assertThrows(LedgerIntegrityViolation::class, $buggy, 'no commission evidence row');
        $this->assertSame('AWAITING_PAYMENT', $this->fx->orderStatus());

        // The guard that catches this specific shape is the one the real handler
        // registers through CommissionRecorder, so prove the real handler is the
        // only path that leaves the order paid.
        $this->fx->capture();
        $this->assertSame('PAID', $this->fx->orderStatus());
        $this->assertNotSame(null, $kernel->commission->forwardEntryFor($orderId));
    }

    /**
     * cluster_warning: "double payout on a replayed webhook".
     */
    public function testAReplayedProviderEventCannotPayTwice(): void
    {
        $kernel = $this->fx->kernel;
        $event = new WebhookEvent(
            provider: 'payfast-sim',
            providerEventId: 'evt_only_once',
            orderId: $this->fx->orderId,
            type: WebhookEvent::TYPE_PAYMENT_CAPTURED,
            amount: Money::fromRand($this->fx->itemPrice),
        );

        $kernel->recordPayment->handle($event);
        $first = $kernel->ledger->entriesForOrder($this->fx->orderId);
        [$tokenId, $pin] = $this->fx->scheduledHandover();
        $kernel->confirmHandover->handle($tokenId, 'buyer', $pin, MoneyFixture::BUYER);
        $kernel->confirmHandover->handle($tokenId, 'seller', $pin, MoneyFixture::SELLER);
        $kernel->completeOrder->handle($this->fx->orderId);
        $kernel->requestPayout->handle(
            MoneyFixture::SELLER,
            Money::fromCents(120807),
            'po_key_1',
            'acc_XXXX1234',
        );

        // Same provider event, redelivered by a queue that considers the first
        // attempt unacknowledged.
        $second = $kernel->recordPayment->handle($event);
        $this->assertSame('duplicate', $second->status);
        $this->assertSame(
            count($first) + 2,
            $kernel->ledger->count(),
            'earnings, commission, hold, then one release and one payout - and nothing from the replay',
        );

        $balance = $kernel->ledger->sellerBalance(MoneyFixture::SELLER);
        $this->assertSame(0, $balance->cents, 'the seller was paid, and the replay took nothing more');
    }

    public function testReplayingThePayoutItselfIsRefusedByTheIdempotencyKey(): void
    {
        $this->fx->completeSale();

        $first = $this->fx->kernel->requestPayout->handle(
            MoneyFixture::SELLER,
            Money::fromCents(120807),
            'po_same_key',
            'acc_XXXX1234',
        );
        $second = $this->fx->kernel->requestPayout->handle(
            MoneyFixture::SELLER,
            Money::fromCents(120807),
            'po_same_key',
            'acc_XXXX1234',
        );

        $this->assertTrue($first, 'the first payout request is accepted');
        $this->assertFalse($second, 'the retry with the same key is a no-op, not a second payment');
        $this->assertSame(
            0,
            $this->fx->kernel->ledger->sellerBalance(MoneyFixture::SELLER)->cents,
            'exactly one payout left the balance at zero, not at -1208.07',
        );
    }

    /**
     * cluster_warning: "refund reverses payment but not commission".
     */
    public function testARefundThatKeepsTheCommissionIsRolledBack(): void
    {
        $this->fx->capture();
        $kernel = $this->fx->kernel;
        $orderId = $this->fx->orderId;
        $kernel->initiateRefund->handle($orderId, 'Buyer changed their mind');

        $buggy = static function () use ($kernel, $orderId): void {
            $kernel->uow->begin();
            $order = $kernel->orders->require($orderId);
            $outstanding = $kernel->ledger->unreleasedHold($order->id);
            if (!$outstanding->isZero()) {
                $kernel->ledger->record(
                    $order->sellerId, $order->id, Ledger::TYPE_HOLD_RELEASE, $outstanding, 'Hold closed by refund',
                );
            }
            $kernel->ledger->record(
                $order->sellerId, $order->id, Ledger::TYPE_REFUND, $order->itemPrice, 'Refunded to buyer',
            );
            // The omission: the commission row is left in place.
            $order->apply(Order::EV_REFUND_SETTLED);
            $kernel->orders->save($order);
            $kernel->uow->commit();
        };

        $this->assertThrows(
            LedgerIntegrityViolation::class,
            $buggy,
            'was refunded but still carries net commission',
        );
        $this->assertSame('REFUND_PENDING', $this->fx->orderStatus(), 'the refund never settled');
        $this->assertSame(3, $this->fx->ledgerCount(), 'and nothing was booked');
    }

    public function testTheCorrectRefundBringsTheSellerBackToExactlyZero(): void
    {
        $this->fx->capture();
        $kernel = $this->fx->kernel;

        $kernel->initiateRefund->handle($this->fx->orderId, 'Buyer changed their mind');
        $this->assertSame('REFUND_PENDING', $this->fx->orderStatus());
        $this->assertSame(3, $this->fx->ledgerCount(), 'opening a refund moves no money');

        $kernel->settleRefund->handle($this->fx->orderId, 'Buyer changed their mind');
        $this->assertSame('REFUNDED', $this->fx->orderStatus());
        $this->assertSame(
            0,
            $kernel->ledger->sellerBalance(MoneyFixture::SELLER)->cents,
            'a fully refunded sale must leave the seller owed nothing and owing nothing',
        );
        $this->assertSame(
            0,
            $kernel->ledger->netCommissionForOrder($this->fx->orderId)->cents,
            'and the platform kept no commission on a sale that did not happen',
        );
    }

    /**
     * The failure mode v1.0 line 545 forbids: a handover PIN turning an unpaid
     * order into a paid one.
     */
    public function testAHandoverPinCannotBePresentedForAnUnpaidOrder(): void
    {
        $this->assertThrows(
            IllegalTransition::class,
            fn () => $this->fx->kernel->scheduleHandover->handle($this->fx->orderId),
            'event "HANDOVER_SCHEDULED" is not valid from state "AWAITING_PAYMENT"',
        );
        $this->assertSame('AWAITING_PAYMENT', $this->fx->orderStatus());
        $this->assertSame(0, $this->fx->kernel->handoverTokens->count(), 'and no token was created');
    }

    public function testNoHandoverEventReachesPaidInEitherDirection(): void
    {
        $machine = Order::machine();
        foreach (array_keys(Order::TRANSITIONS) as $state) {
            foreach (array_keys(Order::TRANSITIONS[$state]) as $event) {
                if (Order::TRANSITIONS[$state][$event] === Order::PAID) {
                    $this->assertSame(
                        Order::EV_PAYMENT_RECORDED,
                        $event,
                        "only a recorded payment may reach PAID, but {$state} reaches it via {$event}",
                    );
                }
            }
        }
    }

    /**
     * cluster_warning: "a ledger row edited after the fact".
     */
    public function testAWrittenLedgerRowCannotBeEditedOrDeleted(): void
    {
        $this->fx->capture();
        $kernel = $this->fx->kernel;
        $rows = $kernel->ledger->entriesForOrder($this->fx->orderId);
        $row = $rows[0];

        $this->assertThrows(
            \DomainException::class,
            static function () use ($kernel, $row): void {
                $row['amount_cents'] = 1;
                $kernel->store->update(Ledger::TABLE, $row);
            },
            'append-only',
        );

        $this->assertThrows(
            \DomainException::class,
            static fn () => $kernel->store->delete(Ledger::TABLE, (string) $row['id']),
            'append-only',
        );

        $this->assertSame(129900, (int) $kernel->store->find(Ledger::TABLE, (string) $row['id'])['amount_cents']);
    }

    public function testALedgerReversalMustPointAtTheRowItReverses(): void
    {
        $this->fx->capture();
        $kernel = $this->fx->kernel;

        $attempt = static function () use ($kernel): void {
            $kernel->uow->begin();
            try {
                $kernel->ledger->record(
                    MoneyFixture::SELLER,
                    'ord_unrelated',
                    Ledger::TYPE_COMMISSION_REVERSAL,
                    Money::fromCents(100),
                    'a reversal with nothing behind it',
                );
            } finally {
                $kernel->uow->rollback();
            }
        };

        $this->assertThrows(\LogicException::class, $attempt, 'must reference the entry it reverses');

        // And a reversal may point only at a row that exists.
        $attemptNamed = static function () use ($kernel): void {
            $kernel->uow->begin();
            try {
                $kernel->ledger->record(
                    MoneyFixture::SELLER,
                    'ord_unrelated',
                    Ledger::TYPE_COMMISSION_REVERSAL,
                    Money::fromCents(100),
                    'reversal of a fabricated row',
                    'led_does_not_exist',
                );
            } finally {
                $kernel->uow->rollback();
            }
        };
        $this->assertThrows(\RuntimeException::class, $attemptNamed, 'does not exist');
        $this->assertSame(3, $this->fx->ledgerCount(), 'neither attempt booked anything');
    }

    public function testHeldEarningsAreNotPayableBeforeTheSaleCompletes(): void
    {
        $this->fx->capture();

        $this->assertThrows(
            PayoutRejected::class,
            fn () => $this->fx->kernel->requestPayout->handle(
                MoneyFixture::SELLER,
                Money::fromCents(1),
                'po_too_early',
                'acc_XXXX1234',
            ),
            'exceeds the ledger balance of',
        );
        $this->assertSame(
            [],
            array_values(array_filter(
                $this->fx->kernel->ledger->entriesForOrder($this->fx->orderId),
                static fn (array $row): bool => (string) $row['entry_type'] === Ledger::TYPE_PAYOUT,
            )),
            'a refused payout must not book a payout row',
        );
    }

    public function testAPayoutLargerThanTheBalanceCannotOverdraw(): void
    {
        $this->fx->completeSale();

        $this->assertThrows(
            PayoutRejected::class,
            fn () => $this->fx->kernel->requestPayout->handle(
                MoneyFixture::SELLER,
                Money::fromCents(120808),
                'po_overdraw',
                'acc_XXXX1234',
            ),
            'exceeds the ledger balance',
        );
        $this->assertSame(
            120807,
            $this->fx->kernel->ledger->sellerBalance(MoneyFixture::SELLER)->cents,
            'the balance is untouched by the refused attempt',
        );
    }

    /**
     * The two above are refused by RequestPayout's own guard, which fires first — so
     * neither proves the invariant at the transaction layer. These two do: no handler
     * is involved, and the only thing left standing is the check the unit of work runs
     * on commit. That is the whole claim of ADR-0001, and it is worth nothing until a
     * test bypasses every handler to reach it.
     */
    public function testMoneyHeldOnAnAlreadyClosedOrderCannotBeCommitted(): void
    {
        $this->fx->completeSale();
        $kernel = $this->fx->kernel;
        $orderId = $this->fx->orderId;

        // An operator tool that writes a HOLD against a completed sale. Nothing about
        // that row is invalid on its own; the order being COMPLETED is what makes it
        // impossible, and only the transaction can see both.
        $buggy = static function () use ($kernel, $orderId): void {
            $kernel->uow->begin();
            $kernel->ledger->record(
                MoneyFixture::SELLER,
                $orderId,
                Ledger::TYPE_HOLD,
                Money::fromRand('50.00'),
                'manual hold on a completed sale',
            );
            $kernel->uow->commit();
        };

        $this->assertThrows(LedgerIntegrityViolation::class, $buggy, 'still held');
        $this->assertSame(
            120807,
            $kernel->ledger->sellerBalance(MoneyFixture::SELLER)->cents,
            'the released balance is unchanged by the refused hold',
        );
    }

    public function testASellerBalanceDrivenNegativeByALedgerRowAloneCannotBeCommitted(): void
    {
        $this->fx->completeSale();
        $kernel = $this->fx->kernel;
        $orderId = $this->fx->orderId;

        // The same overdraw, written straight to the ledger so the payout guard cannot
        // catch it first. A CHARGEBACK is the realistic author: the provider notifies us
        // and something books the debit without asking what the balance can carry.
        $buggy = static function () use ($kernel, $orderId): void {
            $kernel->uow->begin();
            $kernel->ledger->record(
                MoneyFixture::SELLER,
                $orderId,
                Ledger::TYPE_CHARGEBACK,
                Money::fromRand('2000.00'),
                'provider chargeback',
            );
            $kernel->uow->commit();
        };

        $this->assertThrows(LedgerIntegrityViolation::class, $buggy, 'would be left at');
        $this->assertSame(
            120807,
            $kernel->ledger->sellerBalance(MoneyFixture::SELLER)->cents,
            'the rolled-back chargeback leaves the earned balance intact',
        );
    }

}

