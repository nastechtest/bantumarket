<?php

declare(strict_types=1);

namespace NasTech\Payments;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;

/**
 * Provider webhook authentication.
 *
 * Three separate defences, because each stops a different attack:
 *   1. HMAC over timestamp + body          — forger cannot invent a payment
 *   2. timestamp tolerance window          — captured request expires
 *   3. seen-signature unique index         — a replay inside the window is refused
 *
 * Defence 3 is the one that is usually skipped and the one the ledger cannot
 * survive without: without it, resending the same "paid" callback once more
 * than once is enough to double a payout.
 */
final class WebhookVerifier
{
    public const TABLE = 'seen_webhook_signatures';

    private const CLOCK_SKEW_TOLERANCE_SECONDS = 300;

    public function __construct(
        private readonly Store $store,
        private readonly Clock $clock,
        private readonly string $signingSecret,
    ) {
        if (strlen($this->signingSecret) < 32) {
            throw new \InvalidArgumentException(
                'Webhook signing secret must be at least 32 chars; a short secret is a brute-force target'
            );
        }
    }

    public function verify(string $rawBody, string $headerSignature, string $headerTimestamp): void
    {
        $provided = $this->normalise($headerSignature);
        if ($provided === '') {
            throw new WebhookRejected('Missing webhook signature');
        }

        $expected = $this->normalise($this->compute($headerTimestamp, $rawBody));

        if (!hash_equals($expected, $provided)) {
            throw new WebhookRejected('Signature does not match — request was not sent by the provider');
        }

        $timestamp = $this->parseTimestamp($headerTimestamp);
        $age = $this->clock->now()->getTimestamp() - $timestamp->getTimestamp();
        if (abs($age) > self::CLOCK_SKEW_TOLERANCE_SECONDS) {
            throw new WebhookRejected(sprintf(
                'Webhook timestamp is %ds from platform time; outside the %ds tolerance. '
                . 'A captured request must not stay valid indefinitely.',
                $age,
                self::CLOCK_SKEW_TOLERANCE_SECONDS,
            ));
        }

        // Replay protection, enforced by a unique index rather than a lookup: a
        // read-then-write would race across two concurrent copies of the same
        // callback. The insert *is* the check. The storage violation is translated,
        // not suppressed — the caller still cannot tell whether the index or a
        // forgery stopped it, but the platform log can, and the HTTP layer gets a
        // 4xx domain error instead of a 500.
        try {
            $this->store->insert(self::TABLE, [
                'id' => $provided,
                'signature' => $provided,
                'received_at' => $this->clock->now()->format(\DateTimeInterface::ATOM),
            ]);
        } catch (UniqueConstraintViolation $seen) {
            throw new WebhookRejected(sprintf(
                'Replay detected: signature %s has already been accepted. '
                . 'The payment was booked the first time; booking it again would double the payout.',
                substr($provided, 0, 12),
            ), 0, $seen);
        }
    }

    /**
     * The signature a correctly-behaving provider sends for this body. Exposed for
     * the test harness and for outbound callbacks the platform signs itself; verify
     * uses the same path so the two can never drift apart.
     */
    public function sign(string $rawBody, string $timestamp): string
    {
        return $this->compute($timestamp, $rawBody);
    }

    private function compute(string $timestamp, string $rawBody): string
    {
        return hash_hmac('sha256', $timestamp . '.' . $rawBody, $this->signingSecret);
    }

    private function normalise(string $signature): string
    {
        $signature = strtolower(trim($signature));
        foreach (['sha256=', 'v1=', 'whsec_'] as $prefix) {
            if (str_starts_with($signature, $prefix)) {
                return substr($signature, strlen($prefix));
            }
        }

        return $signature;
    }

    private function parseTimestamp(string $value): \DateTimeImmutable
    {
        if (ctype_digit($value)) {
            return (new \DateTimeImmutable('@' . (int) $value));
        }
        try {
            return new \DateTimeImmutable($value);
        } catch (\Throwable) {
            throw new WebhookRejected("Unparseable webhook timestamp: {$value}");
        }
    }
}
