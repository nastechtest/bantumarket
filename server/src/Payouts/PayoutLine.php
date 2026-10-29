<?php

declare(strict_types=1);

namespace NasTech\Payouts;

use NasTech\SharedKernel\Money;

/**
 * One seller's instruction inside a batch.
 *
 * It carries the masked destination as a value object, never a reference to a
 * stored bank record: the batch has to be readable years later when the seller
 * has changed banks, and "what we paid to" is part of the payout evidence.
 *
 * `ledgerEntryId` is written on release and `reversalLedgerEntryId` on a failed
 * attempt. Both are pointers to Settlements' append-only ledger; this module
 * never edits a ledger row and never invents an amount that is not the one the
 * ledger recorded.
 */
final class PayoutLine
{
    public const TABLE = 'payout_lines';

    public function __construct(
        public readonly string $id,
        public readonly string $batchId,
        public readonly string $sellerId,
        public readonly string $orderId,
        public readonly Money $amount,
        public readonly BankDestination $destination,
        public readonly \DateTimeImmutable $oldestPayableAt,
        public ?string $ledgerEntryId = null,
        public ?string $reversalLedgerEntryId = null,
    ) {
        if ($sellerId === '' || $orderId === '') {
            throw new \InvalidArgumentException('A payout line names both the seller and the order whose money it pays');
        }
        if (!$amount->isPositive()) {
            throw new \InvalidArgumentException('A payout line is a positive amount');
        }
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'batch_id' => $this->batchId,
            'seller_id' => $this->sellerId,
            'order_id' => $this->orderId,
            'amount_cents' => $this->amount->cents,
            'currency' => $this->amount->currency,
            'bank_brand' => $this->destination->brand->value,
            'bank_last_four' => $this->destination->lastFour,
            'oldest_payable_at' => $this->oldestPayableAt->format(\DateTimeInterface::ATOM),
            'ledger_entry_id' => $this->ledgerEntryId,
            'reversal_ledger_entry_id' => $this->reversalLedgerEntryId,
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            batchId: (string) $row['batch_id'],
            sellerId: (string) $row['seller_id'],
            orderId: (string) $row['order_id'],
            amount: Money::fromCents((int) $row['amount_cents'], (string) $row['currency']),
            destination: BankDestination::fromRow($row),
            oldestPayableAt: new \DateTimeImmutable((string) $row['oldest_payable_at']),
            ledgerEntryId: $row['ledger_entry_id'] === null ? null : (string) $row['ledger_entry_id'],
            reversalLedgerEntryId: $row['reversal_ledger_entry_id'] === null
                ? null
                : (string) $row['reversal_ledger_entry_id'],
        );
    }
}
