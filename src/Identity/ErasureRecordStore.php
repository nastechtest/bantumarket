<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Persistence\Store;

/**
 * The erasure evidence table. Append-only, and there is deliberately no
 * `findByAccount()` that returns the latest and hides the rest: an account may
 * be erased once, but the query that asks "was this subject erased" belongs to
 * a reporting projection, not to the write path.
 */
final class ErasureRecordStore
{
    public const TABLE = 'erasure_records';

    public function __construct(private readonly Store $store)
    {
    }

    public function append(ErasureRecord $record): void
    {
        $this->store->insert(self::TABLE, $record->toArray());
    }

    public function find(string $id): ?ErasureRecord
    {
        $row = $this->store->find(self::TABLE, $id);

        return $row === null ? null : ErasureRecord::fromRow($row);
    }

    /**
     * @return list<ErasureRecord>
     */
    public function forAccount(string $accountId): array
    {
        $records = [];
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['account_id'] === $accountId) {
                $records[] = ErasureRecord::fromRow($row);
            }
        }

        return $records;
    }
}
