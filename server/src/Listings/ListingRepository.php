<?php

declare(strict_types=1);

namespace NasTech\Listings;

use NasTech\SharedKernel\Persistence\Store;

final class ListingRepository
{
    public const TABLE = 'listings';

    public function __construct(private readonly Store $store)
    {
    }

    public function save(Listing $listing): void
    {
        $row = $listing->toArray();
        if ($this->store->find(self::TABLE, $listing->id) === null) {
            $this->store->insert(self::TABLE, $row);

            return;
        }
        $this->store->update(self::TABLE, $row);
    }

    public function require(string $id): Listing
    {
        $row = $this->store->find(self::TABLE, $id);
        if ($row === null) {
            throw new \RuntimeException("Unknown listing: {$id}");
        }

        return Listing::fromRow($row);
    }
}
