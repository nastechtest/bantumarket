<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Add a delivery address. The first address for an account becomes the
 * default; later ones do not, because "the default changed when I added a
 * second address" is a surprise during checkout.
 */
final class AddAddress
{
    public function __construct(
        private readonly AddressBookStore $addresses,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(
        string $accountId,
        string $recipientName,
        string $line1,
        ?string $line2 = null,
        ?string $locality = null,
        ?string $provinceCode = null,
        ?string $postalCode = null,
        ?string $label = null,
    ): Address {
        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $address = Address::create(
                id: Id::generate('adr')->value(),
                accountId: $accountId,
                label: $label,
                recipientName: $recipientName,
                line1: $line1,
                line2: $line2,
                locality: $locality,
                provinceCode: $provinceCode,
                postalCode: $postalCode,
                now: $now,
            );

            if ($this->addresses->defaultFor($accountId) === null) {
                $address->markDefault();
            }
            $this->addresses->save($address);

            $this->outbox->publish('Account', $accountId, 'AddressAdded', [
                'account_id' => $accountId,
                'address_id' => $address->id,
                'is_default' => $address->isDefault,
                'at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return $address;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
