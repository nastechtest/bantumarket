<?php

declare(strict_types=1);

namespace NasTech\Tests\MoneyPath;

use NasTech\Payments\WebhookEvent;
use NasTech\Payments\WebhookRejected;
use NasTech\Tests\Support\MoneyFixture;
use NasTech\Tests\TestCase;

/**
 * The three defences on the payment callback, each against a different attack.
 *
 * A signature check alone still lets a captured request be replayed; a timestamp
 * window alone still lets a forger who is inside the window invent a payment. All
 * three are here because the ledger cannot survive losing any one of them.
 */
final class WebhookSecurityTest extends TestCase
{
    private MoneyFixture $fx;

    public function setUp(): void
    {
        $this->fx = new MoneyFixture();
    }

    public function testARequestThatIsCorrectlySignedIsAccepted(): void
    {
        $body = '{"event_id":"evt_1","order_id":"ord_1","type":"payment.captured","amount":"1299.00","currency":"ZAR"}';
        $timestamp = (string) $this->fx->clock->now()->getTimestamp();
        $signature = $this->fx->kernel->webhooks->sign($body, $timestamp);

        $this->fx->kernel->webhooks->verify($body, $signature, $timestamp);
        $this->assertTrue(true, 'verify() returning without throwing is the acceptance');
    }

    public function testAForgeIsRejected(): void
    {
        $body = '{"event_id":"evt_2","order_id":"ord_1","type":"payment.captured","amount":"1299.00"}';
        $timestamp = (string) $this->fx->clock->now()->getTimestamp();

        $this->assertThrows(
            WebhookRejected::class,
            fn () => $this->fx->kernel->webhooks->verify($body, str_repeat('0', 64), $timestamp),
            'not sent by the provider',
        );
    }

    public function testATamperedBodyInvalidatesTheSignature(): void
    {
        $body = '{"event_id":"evt_3","order_id":"ord_1","type":"payment.captured","amount":"1299.00"}';
        $timestamp = (string) $this->fx->clock->now()->getTimestamp();
        $signature = $this->fx->kernel->webhooks->sign($body, $timestamp);

        // The classic attack: keep the signature, change the amount.
        $tampered = str_replace('1299.00', '12.99', $body);

        $this->assertThrows(
            WebhookRejected::class,
            fn () => $this->fx->kernel->webhooks->verify($tampered, $signature, $timestamp),
            'not sent by the provider',
        );
    }

    public function testACapturedRequestExpires(): void
    {
        $body = '{"event_id":"evt_4","order_id":"ord_1","type":"payment.captured","amount":"1299.00"}';
        $issuedAt = (string) $this->fx->clock->now()->getTimestamp();
        $signature = $this->fx->kernel->webhooks->sign($body, $issuedAt);

        $this->fx->clock->advance('PT10M');

        $this->assertThrows(
            WebhookRejected::class,
            fn () => $this->fx->kernel->webhooks->verify($body, $signature, $issuedAt),
            'outside the',
        );
    }

    public function testAReplayInsideTheWindowIsRefusedByTheSeenSignatureIndex(): void
    {
        $body = '{"event_id":"evt_5","order_id":"ord_1","type":"payment.captured","amount":"1299.00"}';
        $timestamp = (string) $this->fx->clock->now()->getTimestamp();
        $signature = $this->fx->kernel->webhooks->sign($body, $timestamp);

        $this->fx->kernel->webhooks->verify($body, $signature, $timestamp);

        $thrown = $this->assertThrows(
            WebhookRejected::class,
            fn () => $this->fx->kernel->webhooks->verify($body, $signature, $timestamp),
            'Replay detected',
        );

        // The caller-visible error is a domain error, but what actually stopped the
        // replay must still be the unique index. If this ever becomes a hand-written
        // "have I seen this?" lookup, the previous goes missing and this breaks.
        $previous = $thrown->getPrevious();
        $this->assertInstanceOf(\NasTech\SharedKernel\Persistence\UniqueConstraintViolation::class, $previous);
        $this->assertStringContains('seen_webhook_signatures', (string) $previous?->getMessage());
    }

    public function testAHeaderPrefixDoesNotWeakenTheCheck(): void
    {
        // Providers differ on header format. Every variant must verify identically —
        // but each needs its own event, because a second delivery of the same
        // signature is a replay and is supposed to be refused.
        $formats = [
            'bare' => static fn (string $sig): string => $sig,
            'sha256=' => static fn (string $sig): string => 'sha256=' . $sig,
            'v1=' => static fn (string $sig): string => 'v1=' . $sig,
            'whsec_' => static fn (string $sig): string => 'whsec_' . $sig,
            'uppercase' => static fn (string $sig): string => strtoupper($sig),
            'padded' => static fn (string $sig): string => '  sha256=' . $sig . " \t",
        ];

        foreach ($formats as $label => $build) {
            $body = sprintf(
                '{"event_id":"evt_%s","order_id":"ord_1","type":"payment.captured","amount":"1299.00"}',
                str_replace(['=', '_'], '', $label),
            );
            $timestamp = (string) $this->fx->clock->now()->getTimestamp();
            $bare = $this->fx->kernel->webhooks->sign($body, $timestamp);

            try {
                $this->fx->kernel->webhooks->verify($body, $build($bare), $timestamp);
            } catch (WebhookRejected $e) {
                $this->fail("header format '{$label}' was rejected: " . $e->getMessage());
            }
        }

        // A prefix must not become an escape hatch: a wrong digest wearing a
        // recognised prefix is still a forgery.
        $body = '{"event_id":"evt_prefix_bad","order_id":"ord_1","type":"payment.captured","amount":"1299.00"}';
        $timestamp = (string) $this->fx->clock->now()->getTimestamp();

        $this->assertThrows(
            WebhookRejected::class,
            fn () => $this->fx->kernel->webhooks->verify($body, 'sha256=' . str_repeat('0', 64), $timestamp),
            'not sent by the provider',
        );

        $this->assertThrows(
            WebhookRejected::class,
            fn () => $this->fx->kernel->webhooks->verify($body, '', $timestamp),
            'Missing webhook signature',
        );

        $this->assertThrows(
            WebhookRejected::class,
            fn () => $this->fx->kernel->webhooks->verify($body, 'sha256=', $timestamp),
            'Missing webhook signature',
        );
    }

    public function testAWronglyStampedRequestIsRefusedEvenWithTheRightSignature(): void
    {
        $body = '{"event_id":"evt_6","order_id":"ord_1","type":"payment.captured","amount":"1299.00"}';
        $future = (string) $this->fx->clock->now()->modify('+1 hour')->getTimestamp();
        $signature = $this->fx->kernel->webhooks->sign($body, $future);

        $this->assertThrows(
            WebhookRejected::class,
            fn () => $this->fx->kernel->webhooks->verify($body, $signature, $future),
            'outside the',
        );
    }

    public function testAShortSecretIsRefusedAtConstruction(): void
    {
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => new \NasTech\Payments\WebhookVerifier(
                $this->fx->kernel->store,
                $this->fx->clock,
                'too-short',
            ),
            'at least 32 chars',
        );
    }

    public function testAnEventWithNoIdCannotBeDeduplicated(): void
    {
        $this->assertThrows(
            WebhookRejected::class,
            static fn () => new WebhookEvent('payfast-sim', '', 'ord_1', WebhookEvent::TYPE_PAYMENT_CAPTURED, \NasTech\SharedKernel\Money::fromRand('10.00')),
            'cannot be deduplicated',
        );
    }

    public function testAnUnknownProviderEventTypeIsRefusedRatherThanAssumed(): void
    {
        $this->assertThrows(
            WebhookRejected::class,
            static fn () => new WebhookEvent('payfast-sim', 'evt_x', 'ord_1', 'payment.refund.pend', \NasTech\SharedKernel\Money::fromRand('10.00')),
            'Unhandled provider event type',
        );
    }

    public function testAnEventInAnotherCurrencyIsRefusedNotConverted(): void
    {
        // Silently treating a USD amount as ZAR is a 16x error, and there is no
        // exchange rate in this codebase to do it properly.
        $this->assertThrows(
            WebhookRejected::class,
            static fn () => WebhookEvent::fromBody('payfast-sim', [
                'event_id' => 'evt_usd',
                'order_id' => 'ord_1',
                'type' => WebhookEvent::TYPE_PAYMENT_CAPTURED,
                'amount' => '1299.00',
                'currency' => 'usd',
            ]),
            'not in ZAR',
        );
    }

    public function testAnAmountSentAsCentsIsNotMistakenForRand(): void
    {
        $event = WebhookEvent::fromBody('payfast-sim', [
            'event_id' => 'evt_cents',
            'order_id' => 'ord_1',
            'type' => WebhookEvent::TYPE_PAYMENT_CAPTURED,
            'amount' => 129900,
            'currency' => 'ZAR',
        ]);

        $this->assertSame(129900, $event->amount->cents);
    }
}
