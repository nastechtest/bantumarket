<?php

declare(strict_types=1);

namespace NasTech\Payouts;

use NasTech\SharedKernel\Money;

/**
 * A payout batch: one maker's instruction, one checker's approval, one
 * transaction's worth of ledger rows.
 *
 * The batch is the unit maker-checker acts on, and the two rules that make that
 * real live in this object rather than in a form:
 *
 *  - `approve()` refuses the preparer, so "two people" is a property of the
 *    aggregate and not of the screen the button was on;
 *  - a batch is PREPARED until money moves. Approval and release are the same
 *    transition because a batch that is "approved" but has no ledger row is a
 *    second source of truth waiting to disagree with the ledger.
 *
 * Total is the sum of the lines, checked in the constructor. A header total
 * that can drift from its lines is the reconciliation defect that takes a day
 * to find, so the object refuses to exist in that state.
 */
final class PayoutBatch
{
    public const TABLE = 'payout_batches';

    public const STATUS_PREPARED = 'PREPARED';
    public const STATUS_RELEASED = 'RELEASED';
    public const STATUS_FAILED = 'FAILED';

    /** @var list<string> Mirrored by batch_status_is_known in 014_payouts.sql. */
    public const STATUSES = [self::STATUS_PREPARED, self::STATUS_RELEASED, self::STATUS_FAILED];

    /** @var list<PayoutLine> */
    public array $lines;

    private int $loadedVersion;

    /**
     * @param list<PayoutLine> $lines
     */
    public function __construct(
        public readonly string $id,
        public readonly string $payoutKey,
        public readonly string $requestDigest,
        public string $status,
        public readonly string $preparedBy,
        public ?string $approvedBy,
        public readonly Money $total,
        array $lines,
        public readonly \DateTimeImmutable $preparedAt,
        public ?\DateTimeImmutable $releasedAt = null,
        public ?\DateTimeImmutable $failedAt = null,
        public ?string $failureReason = null,
        public int $version = 1,
    ) {
        if (!in_array($status, self::STATUSES, true)) {
            throw new \InvalidArgumentException("Unknown payout batch status: {$status}");
        }
        if (trim($payoutKey) === '') {
            throw new \InvalidArgumentException('A payout batch has an idempotency key');
        }
        if (trim($preparedBy) === '') {
            throw new \InvalidArgumentException('A payout batch names the staff member who prepared it');
        }
        if ($lines === []) {
            throw new \InvalidArgumentException('An empty payout batch moves nothing and proves nothing');
        }

        $sum = Money::zero($total->currency);
        foreach ($lines as $line) {
            if ($line->batchId !== $id) {
                throw new \LogicException("Payout line {$line->id} does not belong to batch {$id}");
            }
            $sum = $sum->add($line->amount);
        }
        if (!$sum->equals($total)) {
            throw new \LogicException(sprintf(
                'Payout batch %s states %s but its lines add up to %s',
                $id,
                $total->toRandString(),
                $sum->toRandString(),
            ));
        }
        if (!$total->isPositive()) {
            throw new \InvalidArgumentException('A payout batch total is a positive amount');
        }

        $this->lines = $lines;
        $this->loadedVersion = $version;
    }

    public function loadedVersion(): int
    {
        return $this->loadedVersion;
    }

    /**
     * Mark the batch loaded, so the repository can refuse a stale overwrite.
     */
    public function markPersisted(): void
    {
        $this->loadedVersion = $this->version;
    }

    public function isPrepared(): bool
    {
        return $this->status === self::STATUS_PREPARED;
    }

    public function isReleased(): bool
    {
        return $this->status === self::STATUS_RELEASED;
    }

    public function isFailed(): bool
    {
        return $this->status === self::STATUS_FAILED;
    }

    /**
     * Approve and release. Idempotent on a batch that is already released:
     * the caller gets the same answer and no second ledger row.
     */
    public function approve(string $approverId, \DateTimeImmutable $at): void
    {
        if ($this->status === self::STATUS_RELEASED) {
            return;
        }
        if ($this->status !== self::STATUS_PREPARED) {
            throw new PayoutRefused(
                PayoutRefused::INVALID_STATE,
                sprintf('batch %s is %s; only a PREPARED batch can be approved', $this->id, $this->status),
            );
        }
        if (trim($approverId) === '') {
            throw new PayoutRefused(PayoutRefused::MISSING_APPROVER, 'an approval names the checker');
        }
        if ($approverId === $this->preparedBy) {
            throw new PayoutRefused(
                PayoutRefused::MAKER_CANNOT_APPROVE,
                sprintf(
                    'staff member %s prepared batch %s and may not approve it; approval needs a second person',
                    $approverId,
                    $this->id,
                ),
            );
        }

        $this->approvedBy = $approverId;
        $this->releasedAt = $at;
        $this->status = self::STATUS_RELEASED;
        $this->version++;
    }

    /**
     * A failed attempt, after release. The ledger is repaired by the command
     * writing a contra row per line; this object only records the outcome.
     */
    public function fail(string $reason, \DateTimeImmutable $at): void
    {
        if ($this->status === self::STATUS_FAILED) {
            return;
        }
        if ($this->status !== self::STATUS_RELEASED) {
            throw new PayoutRefused(
                PayoutRefused::INVALID_STATE,
                sprintf('batch %s is %s; only a released batch can be reversed', $this->id, $this->status),
            );
        }
        if (trim($reason) === '') {
            throw new PayoutRefused(PayoutRefused::MISSING_REASON, 'a failed payout states why it failed');
        }

        $this->failureReason = $reason;
        $this->failedAt = $at;
        $this->status = self::STATUS_FAILED;
        $this->version++;
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'payout_key' => $this->payoutKey,
            'request_digest' => $this->requestDigest,
            'status' => $this->status,
            'prepared_by' => $this->preparedBy,
            'approved_by' => $this->approvedBy,
            'total_cents' => $this->total->cents,
            'currency' => $this->total->currency,
            'prepared_at' => $this->preparedAt->format(\DateTimeInterface::ATOM),
            'released_at' => $this->releasedAt?->format(\DateTimeInterface::ATOM),
            'failed_at' => $this->failedAt?->format(\DateTimeInterface::ATOM),
            'failure_reason' => $this->failureReason,
            'version' => $this->version,
        ];
    }
}
