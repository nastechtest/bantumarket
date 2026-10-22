<?php

declare(strict_types=1);

namespace NasTech\Tests\MoneyPath;

use NasTech\Handover\HandoverRejected;
use NasTech\Handover\HandoverToken;
use NasTech\Orders\StaleOrderVersion;
use NasTech\SharedKernel\Money;
use NasTech\Tests\Support\MoneyFixture;
use NasTech\Tests\TestCase;

/**
 * The handover token, and the two-sided rule that makes it evidence.
 *
 * A PIN that one party can present alone is not proof of an exchange; it is a
 * secret that can be guessed, shoulder-surfed or coerced. Both sides having to
 * present it is what makes HANDOVER_CONFIRMED mean something to the money path.
 */
final class HandoverTest extends TestCase
{
    private MoneyFixture $fx;

    public function setUp(): void
    {
        $this->fx = new MoneyFixture();
        $this->fx->capture();
    }

    public function testSchedulingAHandoverAdvancesThePaidOrder(): void
    {
        [$tokenId] = $this->fx->scheduledHandover();

        $this->assertSame('HANDOVER_SCHEDULED', $this->fx->orderStatus());
        $this->assertNotSame(null, $this->fx->kernel->orders->require($this->fx->orderId)->handoverTokenId);
        $this->assertNotSame(null, $this->fx->kernel->handoverTokens->require($tokenId));
    }

    public function testOneSidedConfirmationDoesNotAdvanceTheOrder(): void
    {
        [$tokenId, $pin] = $this->fx->scheduledHandover();

        $result = $this->fx->kernel->confirmHandover->handle($tokenId, 'buyer', $pin, MoneyFixture::BUYER);

        $this->assertTrue($result->accepted);
        $this->assertFalse($result->complete);
        $this->assertSame('seller', $result->awaiting);
        $this->assertSame('HANDOVER_SCHEDULED', $this->fx->orderStatus());
    }

    public function testBothSidesConfirmingAdvancesOnceAndOnlyOnce(): void
    {
        [$tokenId, $pin] = $this->fx->scheduledHandover();
        $this->fx->kernel->confirmHandover->handle($tokenId, 'buyer', $pin, MoneyFixture::BUYER);
        $second = $this->fx->kernel->confirmHandover->handle($tokenId, 'seller', $pin, MoneyFixture::SELLER);

        $this->assertTrue($second->complete);
        $this->assertSame('HANDOVER_CONFIRMED', $this->fx->orderStatus());

        $this->assertThrows(
            HandoverRejected::class,
            fn () => $this->fx->kernel->confirmHandover->handle($tokenId, 'buyer', $pin, MoneyFixture::BUYER),
            'already been confirmed by both parties',
        );
    }

    public function testNeitherPartyCanConfirmForTheOther(): void
    {
        [$tokenId, $pin] = $this->fx->scheduledHandover();

        $this->assertThrows(
            HandoverRejected::class,
            fn () => $this->fx->kernel->confirmHandover->handle($tokenId, 'seller', $pin, MoneyFixture::BUYER),
            'not the seller on this handover',
        );
        $this->assertSame('HANDOVER_SCHEDULED', $this->fx->orderStatus());
    }

    public function testFiveWrongPinsLockTheToken(): void
    {
        [$tokenId, $pin] = $this->fx->scheduledHandover();
        $wrong = $pin === '100000' ? '100001' : '100000';

        for ($attempt = 0; $attempt < HandoverToken::MAX_ATTEMPTS; $attempt++) {
            $result = $this->fx->kernel->confirmHandover->handle($tokenId, 'buyer', $wrong, MoneyFixture::BUYER);
            $this->assertFalse($result->accepted, 'every wrong PIN is refused');
            $this->assertSame(
                HandoverToken::MAX_ATTEMPTS - 1 - $attempt,
                $result->attemptsRemaining,
                'the buyer is told how many attempts are left',
            );
        }

        $this->assertTrue($this->fx->kernel->handoverTokens->require($tokenId)->locked);

        // Locked means locked: the correct PIN no longer works either, and the
        // counter is not reset by the failed attempts having been refused.
        $this->assertThrows(
            HandoverRejected::class,
            fn () => $this->fx->kernel->confirmHandover->handle($tokenId, 'buyer', $pin, MoneyFixture::BUYER),
            'locked after',
        );
    }

    public function testAnExpiredWindowCannotBeConfirmed(): void
    {
        [$tokenId, $pin] = $this->fx->scheduledHandover();
        $this->fx->clock->advance('P3D');

        $this->assertThrows(
            HandoverRejected::class,
            fn () => $this->fx->kernel->confirmHandover->handle($tokenId, 'buyer', $pin, MoneyFixture::BUYER),
            'handover window has closed',
        );
    }

    public function testReissuingRevokesThePreviousToken(): void
    {
        [$firstId, $firstPin] = $this->fx->scheduledHandover();
        $this->fx->clock->advance('P1D');
        [$secondId] = $this->fx->scheduledHandover();

        $this->assertNotSame($firstId, $secondId);
        $this->assertTrue($this->fx->kernel->handoverTokens->require($firstId)->revoked);

        $this->assertThrows(
            HandoverRejected::class,
            fn () => $this->fx->kernel->confirmHandover->handle($firstId, 'buyer', $firstPin, MoneyFixture::BUYER),
            'revoked',
        );
    }

    public function testThePinIsNotRecoverableFromStorage(): void
    {
        [, $pin] = $this->fx->scheduledHandover();
        $rows = $this->fx->kernel->store->all('handover_tokens');

        $this->assertSame(1, count($rows));
        $stored = (string) $rows[0]['pin_hash'];
        $this->assertFalse(str_contains($stored, $pin), 'the PIN must never appear in the stored row');
        $this->assertSame(64, strlen($stored), 'stored as a 256-bit HMAC, not a reversible encoding');
    }

    public function testAHeldTokenValueIsTheBuyerTotalNotTheItemPrice(): void
    {
        $scheduled = $this->fx->kernel->scheduleHandover->handle($this->fx->orderId);
        $this->assertSame(
            Money::fromRand($this->fx->itemPrice)->cents,
            $scheduled->token->heldValue()->cents,
            'the token attests to the exchange of this item for this amount',
        );
    }

    public function testConfirmingHandoverMovesNoMoney(): void
    {
        $before = $this->fx->ledgerCount();

        [$tokenId, $pin] = $this->fx->scheduledHandover();
        $this->fx->kernel->confirmHandover->handle($tokenId, 'buyer', $pin, MoneyFixture::BUYER);
        $this->fx->kernel->confirmHandover->handle($tokenId, 'seller', $pin, MoneyFixture::SELLER);

        $this->assertSame($before, $this->fx->ledgerCount(), 'confirmation is evidence, not settlement');
        $this->assertSame(
            0,
            $this->fx->kernel->ledger->sellerBalance(MoneyFixture::SELLER)->cents,
            'and the seller is still not paid until completion',
        );
    }

    public function testTwoWritersOfTheSameOrderCannotBothSucceed(): void
    {
        $first = $this->fx->kernel->orders->require($this->fx->orderId);
        $second = $this->fx->kernel->orders->require($this->fx->orderId);

        $first->apply(\NasTech\Orders\Order::EV_HANDOVER_SCHEDULED);
        $this->fx->kernel->orders->save($first);

        $second->apply(\NasTech\Orders\Order::EV_REFUND_INITIATED);
        $this->assertThrows(
            StaleOrderVersion::class,
            fn () => $this->fx->kernel->orders->save($second),
            'refusing to overwrite',
        );
    }
}
