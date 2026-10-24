<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Persistence\Store;

/**
 * The impersonation audit trail. Insert-only by design: the store refuses an
 * update, the migration's trigger refuses one, and the app role holds no
 * UPDATE grant — three layers, because this table is what answers an insider
 * investigation.
 */
final class ImpersonationLogStore
{
    public const TABLE = 'impersonation_log';

    public function __construct(private readonly Store $store)
    {
    }

    public function append(ImpersonationLog $entry): void
    {
        $this->store->insert(self::TABLE, $entry->toArray());
    }

    public function find(string $id): ?ImpersonationLog
    {
        $row = $this->store->find(self::TABLE, $id);

        return $row === null ? null : ImpersonationLog::fromRow($row);
    }

    /**
     * @return list<ImpersonationLog>
     */
    public function forTarget(string $accountId): array
    {
        $entries = [];
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['target_account_id'] === $accountId) {
                $entries[] = ImpersonationLog::fromRow($row);
            }
        }

        return $entries;
    }
}
