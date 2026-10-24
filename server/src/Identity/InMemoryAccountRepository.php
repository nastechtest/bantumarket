<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Persistence\Store;

/**
 * The Store-backed account repository — what tests and this environment run.
 *
 * Optimistic locking is a compare-and-swap against the version the aggregate
 * was loaded with, identical in shape to OrderRepository, and the same refusal
 * exists twice more on purpose: the migration's version trigger rejects any
 * write that does not advance, and the unique index on phone_e164 is the one
 * live account per number.
 */
final class InMemoryAccountRepository implements AccountRepository
{
    public const TABLE = 'accounts';

    public function __construct(private readonly Store $store)
    {
    }

    public function save(Account $account): void
    {
        $row = $account->toArray();
        $existing = $this->store->find(self::TABLE, $account->id);

        if ($existing === null) {
            $this->store->insert(self::TABLE, $row);

            return;
        }

        if ((int) $existing['version'] !== $account->loadedVersion()) {
            throw new StaleAccountVersion(sprintf(
                'Account %s was loaded at version %d but the store now holds %d; refusing to overwrite',
                $account->id,
                $account->loadedVersion(),
                (int) $existing['version'],
            ));
        }
        if ($account->version <= $account->loadedVersion()) {
            throw new StaleAccountVersion(sprintf(
                'Account %s is being saved without any change since it was loaded at version %d',
                $account->id,
                $account->loadedVersion(),
            ));
        }

        $this->store->update(self::TABLE, $row);
    }

    public function find(string $id): ?Account
    {
        $row = $this->store->find(self::TABLE, $id);

        return $row === null ? null : Account::fromRow($row);
    }

    public function findByPhone(string $e164): ?Account
    {
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['phone_e164'] === $e164) {
                return Account::fromRow($row);
            }
        }

        return null;
    }

    public function require(string $id): Account
    {
        $account = $this->find($id);
        if ($account === null) {
            throw new \RuntimeException("Unknown account: {$id}");
        }

        return $account;
    }
}
