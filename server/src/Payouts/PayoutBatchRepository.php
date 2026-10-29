<?php

declare(strict_types=1);

namespace NasTech\Payouts;

use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Batches and their lines, with the two storage properties the money path needs.
 *
 * Idempotency is the unique index on `payout_key`, never a read-then-write:
 * a pre-check has a window and an index does not. The request digest is how a
 * retry is told apart from a different payout that reused the key — same key,
 * same lines is a retry; same key, different money is a mistake worth refusing.
 *
 * Updates are compare-and-swap on `version`, the same shape as Order and
 * Account. A batch that was approved in one terminal cannot be approved again
 * from a stale copy and produce a second set of ledger rows.
 */
final class PayoutBatchRepository
{
    public function __construct(private readonly Store $store)
    {
    }

    public function save(PayoutBatch $batch): void
    {
        $row = $batch->toRow();
        $existing = $this->store->find(PayoutBatch::TABLE, $batch->id);

        if ($existing === null) {
            $this->store->insert(PayoutBatch::TABLE, $row);
            foreach ($batch->lines as $line) {
                $this->store->insert(PayoutLine::TABLE, $line->toRow());
            }
            $batch->markPersisted();

            return;
        }

        if ((int) $existing['version'] !== $batch->loadedVersion()) {
            throw new \DomainException(sprintf(
                'Payout batch %s was loaded at version %d but the store now holds %d; refusing to overwrite',
                $batch->id,
                $batch->loadedVersion(),
                (int) $existing['version'],
            ));
        }

        $this->store->update(PayoutBatch::TABLE, $row);
        foreach ($batch->lines as $line) {
            $this->store->update(PayoutLine::TABLE, $line->toRow());
        }
        $batch->markPersisted();
    }

    public function find(string $id): ?PayoutBatch
    {
        $row = $this->store->find(PayoutBatch::TABLE, $id);

        return $row === null ? null : $this->hydrate($row);
    }

    public function require(string $id): PayoutBatch
    {
        $batch = $this->find($id);
        if ($batch === null) {
            throw new \RuntimeException("Unknown payout batch: {$id}");
        }

        return $batch;
    }

    public function findByKey(string $payoutKey): ?PayoutBatch
    {
        foreach ($this->store->all(PayoutBatch::TABLE) as $row) {
            if ((string) $row['payout_key'] === $payoutKey) {
                return $this->hydrate($row);
            }
        }

        return null;
    }

    /**
     * @return list<PayoutBatch>
     */
    public function all(): array
    {
        $batches = [];
        foreach ($this->store->all(PayoutBatch::TABLE) as $row) {
            $batches[] = $this->hydrate($row);
        }

        return $batches;
    }

    public function count(): int
    {
        return count($this->store->all(PayoutBatch::TABLE));
    }

    /**
     * @param array<string,mixed> $row
     */
    private function hydrate(array $row): PayoutBatch
    {
        $batchId = (string) $row['id'];
        $lines = [];
        foreach ($this->store->all(PayoutLine::TABLE) as $lineRow) {
            if ((string) $lineRow['batch_id'] === $batchId) {
                $lines[] = PayoutLine::fromRow($lineRow);
            }
        }
        usort($lines, static fn (PayoutLine $a, PayoutLine $b): int => strcmp($a->orderId, $b->orderId));

        return new PayoutBatch(
            id: $batchId,
            payoutKey: (string) $row['payout_key'],
            requestDigest: (string) $row['request_digest'],
            status: (string) $row['status'],
            preparedBy: (string) $row['prepared_by'],
            approvedBy: $row['approved_by'] === null ? null : (string) $row['approved_by'],
            total: Money::fromCents((int) $row['total_cents'], (string) $row['currency']),
            lines: $lines,
            preparedAt: new \DateTimeImmutable((string) $row['prepared_at']),
            releasedAt: $row['released_at'] === null ? null : new \DateTimeImmutable((string) $row['released_at']),
            failedAt: $row['failed_at'] === null ? null : new \DateTimeImmutable((string) $row['failed_at']),
            failureReason: $row['failure_reason'] === null ? null : (string) $row['failure_reason'],
            version: (int) $row['version'],
        );
    }
}
