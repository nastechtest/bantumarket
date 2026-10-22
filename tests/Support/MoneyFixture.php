<?php

declare(strict_types=1);

namespace NasTech\Tests\Support;

use NasTech\Application\Kernel;
use NasTech\Commissions\CommissionPolicy;
use NasTech\Payments\PaymentRecordingResult;
use NasTech\Payments\WebhookEvent;
use NasTech\SharedKernel\FrozenClock;
use NasTech\SharedKernel\Money;

/**
 * A wired money path with time frozen, one category policy and one order in
 * AWAITING_PAYMENT. Every test starts from here so that what varies between tests
 * is the thing being asserted, never the setup.
 */
final class MoneyFixture
{
    public const SECRET = 'test-webhook-signing-secret-0123456789abcdef';
    public const PEPPER = 'test-handover-pepper-0123456789abcdef';
    public const SELLER = 'sel_thandi';
    public const BUYER = 'byr_sipho';
    public const LISTING = 'lst_0001';
    public const CATEGORY = 'electronics';

    public readonly Kernel $kernel;
    public readonly FrozenClock $clock;
    public readonly string $orderId;
    public readonly string $itemPrice;
    private int $eventSequence = 0;
    private int $dispatchBaseline = 0;

    public function __construct(float $commissionRate = 0.07, string $itemPrice = '1299.00', string $commissionFloor = '5.00')
    {
        $this->clock = FrozenClock::at('2026-11-02T09:00:00+02:00');
        $this->itemPrice = $itemPrice;

        $policy = new CommissionPolicy(
            id: 'pol_electronics_7pc',
            category: self::CATEGORY,
            rate: $commissionRate,
            floor: Money::fromRand($commissionFloor),
            cap: null,
            effectiveFrom: new \DateTimeImmutable('2026-01-01T00:00:00+02:00'),
            effectiveTo: new \DateTimeImmutable('2027-01-01T00:00:00+02:00'),
            reason: 'Launch rate for the electronics pilot category',
        );

        $this->kernel = new Kernel([$policy], self::SECRET, self::PEPPER, $this->clock);
        $this->kernel->listing(self::LISTING, 'Used iPhone 13 128GB', self::SELLER, self::CATEGORY, Money::fromRand($itemPrice));

        $order = $this->kernel->createOrder->handle(self::LISTING, self::BUYER, Money::fromRand($itemPrice));
        $this->orderId = $order->id;

        // Order creation itself publishes an event; counting from here keeps
        // "did the payment transaction dispatch" a question about the payment.
        $this->dispatchBaseline = count($this->kernel->outbox->dispatched());
    }

    /**
     * Simulate the provider telling us a payment was captured.
     */
    public function capture(?string $amount = null, ?string $eventId = null): PaymentRecordingResult
    {
        return $this->kernel->recordPayment->handle(new WebhookEvent(
            provider: 'payfast-sim',
            providerEventId: $eventId ?? $this->nextEventId(),
            orderId: $this->orderId,
            type: WebhookEvent::TYPE_PAYMENT_CAPTURED,
            amount: Money::fromRand($amount ?? $this->itemPrice),
        ));
    }

    public function nextEventId(): string
    {
        return sprintf('evt_%04d', ++$this->eventSequence);
    }

    public function scheduledHandover(): array
    {
        $scheduled = $this->kernel->scheduleHandover->handle($this->orderId);

        return [$scheduled->token->id, $scheduled->pin];
    }

    /**
     * Drive the order all the way to COMPLETED, which is the state a payout needs.
     */
    public function completeSale(): void
    {
        $this->capture();
        [$tokenId, $pin] = $this->scheduledHandover();
        $this->kernel->confirmHandover->handle($tokenId, 'buyer', $pin, self::BUYER);
        $this->kernel->confirmHandover->handle($tokenId, 'seller', $pin, self::SELLER);
        $this->kernel->completeOrder->handle($this->orderId);
    }

    public function orderStatus(): string
    {
        return $this->kernel->orders->require($this->orderId)->status;
    }

    public function ledgerCount(): int
    {
        return $this->kernel->ledger->count();
    }

    public function dispatchedMessages(): int
    {
        return count($this->kernel->outbox->dispatched()) - $this->dispatchBaseline;
    }
}
