<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Persistence\Store;

/**
 * The address book. No delete: a removed address is anonymised in place, and
 * the app role holds no DELETE grant on identity.address_book, so an order
 * record that cites an address keeps a resolvable row after the subject moves
 * on.
 */
final class AddressBookStore
{
    public const TABLE = 'address_book';

    public function __construct(private readonly Store $store)
    {
    }

    public function save(Address $address): void
    {
        $row = $address->toArray();
        if ($this->store->find(self::TABLE, $address->id) === null) {
            $this->store->insert(self::TABLE, $row);

            return;
        }
        $this->store->update(self::TABLE, $row);
    }

    public function find(string $id): ?Address
    {
        $row = $this->store->find(self::TABLE, $id);

        return $row === null ? null : Address::fromRow($row);
    }

    /**
     * @return list<Address>
     */
    public function forAccount(string $accountId): array
    {
        $addresses = [];
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['account_id'] === $accountId) {
                $addresses[] = Address::fromRow($row);
            }
        }

        return $addresses;
    }

    public function defaultFor(string $accountId): ?Address
    {
        foreach ($this->forAccount($accountId) as $address) {
            if ($address->isDefault) {
                return $address;
            }
        }

        return null;
    }
}
