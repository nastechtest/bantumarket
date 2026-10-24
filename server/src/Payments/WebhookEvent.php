<?php

declare(strict_types=1);

namespace NasTech\Payments;

use NasTech\SharedKernel\Money;

/**
 * A provider event after signature, timestamp and replay checks have passed.
 *
 * Constructing this is the reward for verifying; nothing downstream re-checks a
 * signature, and nothing downstream is allowed to trust a raw array either. The
 * amount is a Money, not a string from JSON, so a provider that sends "1299.9"
 * cannot quietly become R1299.09 or R12,999.00 in someone's arithmetic.
 */
final class WebhookEvent
{
    public const TYPE_PAYMENT_CAPTURED = 'payment.captured';
    public const TYPE_REFUND_SETTLED = 'refund.settled';
    public const TYPE_CHARGEBACK_OPENED = 'chargeback.opened';

    public function __construct(
        public readonly string $provider,
        public readonly string $providerEventId,
        public readonly string $orderId,
        public readonly string $type,
        public readonly Money $amount,
    ) {
        if ($providerEventId === '') {
            throw new WebhookRejected('Provider event carries no id; it cannot be deduplicated');
        }
        if ($orderId === '') {
            throw new WebhookRejected('Provider event carries no order reference');
        }
        if (!in_array($type, [self::TYPE_PAYMENT_CAPTURED, self::TYPE_REFUND_SETTLED, self::TYPE_CHARGEBACK_OPENED], true)) {
            throw new WebhookRejected("Unhandled provider event type: {$type}");
        }
    }

    /**
     * @param array<string,mixed> $body  the decoded, signature-verified payload
     */
    public static function fromBody(string $provider, array $body): self
    {
        foreach (['event_id', 'order_id', 'type', 'amount'] as $required) {
            if (!isset($body[$required])) {
                throw new WebhookRejected("Provider event is missing \"{$required}\"");
            }
        }

        $amount = $body['amount'];
        $currency = strtoupper((string) ($body['currency'] ?? 'ZAR'));
        if ($currency !== 'ZAR') {
            throw new WebhookRejected("Provider event is not in ZAR: {$currency}");
        }

        return new self(
            provider: $provider,
            providerEventId: (string) $body['event_id'],
            orderId: (string) $body['order_id'],
            type: (string) $body['type'],
            amount: is_int($amount)
                ? Money::fromCents($amount, $currency)
                : Money::fromRand((string) $amount),
        );
    }
}
