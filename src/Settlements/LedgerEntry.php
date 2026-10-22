<?php

declare(strict_types=1);

namespace NasTech\Settlements;

use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Money;

/**
 * One immutable row of the money ledger.
 */
final class LedgerEntry
{
    public function __construct(
        public readonly Id $id,
        public readonly string $sellerId,
        public readonly ?string $orderId,
        public readonly string $type,
        public readonly Money $amount,
        public readonly string $reason,
        public readonly \DateTimeImmutable $recordedAt,
        public readonly ?string $reversalOf = null,
    ) {
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id->value(),
            'seller_id' => $this->sellerId,
            'order_id' => $this->orderId,
            'entry_type' => $this->type,
            'amount_cents' => $this->amount->cents,
            'currency' => $this->amount->currency,
            'reason' => $this->reason,
            'recorded_at' => $this->recordedAt->format(\DateTimeInterface::ATOM),
            'reversal_of' => $this->reversalOf,
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: Id::fromString((string) $row['id']),
            sellerId: (string) $row['seller_id'],
            orderId: $row['order_id'] === null ? null : (string) $row['order_id'],
            type: (string) $row['entry_type'],
            amount: Money::fromCents((int) $row['amount_cents'], (string) $row['currency']),
            reason: (string) $row['reason'],
            recordedAt: new \DateTimeImmutable((string) $row['recorded_at']),
            reversalOf: $row['reversal_of'] === null ? null : (string) $row['reversal_of'],
        );
    }
}
