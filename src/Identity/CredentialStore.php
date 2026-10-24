<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Persistence\Store;

/**
 * Credentials by account. One row per account, enforced by the unique index
 * on account_id (credentials_one_per_account) rather than by a lookup: the
 * insert *is* the check.
 */
final class CredentialStore
{
    public const TABLE = 'credentials';

    public function __construct(private readonly Store $store)
    {
    }

    public function save(Credential $credential): void
    {
        $row = $credential->toArray();
        $existing = $this->store->find(self::TABLE, $credential->id);
        if ($existing === null) {
            $this->store->insert(self::TABLE, $row);

            return;
        }
        $this->store->update(self::TABLE, $row);
    }

    public function forAccount(string $accountId): ?Credential
    {
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['account_id'] === $accountId) {
                return Credential::fromRow($row);
            }
        }

        return null;
    }

    public function require(string $accountId): Credential
    {
        $credential = $this->forAccount($accountId);
        if ($credential === null) {
            throw new \RuntimeException("Account {$accountId} has no credential");
        }

        return $credential;
    }
}
