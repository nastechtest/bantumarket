<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Make one address the default. This is a two-row write: the old default is
 * cleared and the new one claimed in the same transaction, because the unique
 * index on default_claim_key permits exactly one claim per account. Writing
 * the new claim first would collide; clearing first and failing before the
 * claim commits is impossible, because both rows are in one unit of work.
 */
final class SetDefaultAddress
{
    public function __construct(
        private readonly AddressBookStore $addresses,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(string $accountId, string $addressId): Address
    {
        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $target = $this->addresses->find($addressId);
            if ($target === null || $target->accountId !== $accountId) {
                throw new AccessDenied('The address does not belong to this account');
            }
            if ($target->isAnonymised()) {
                throw new \DomainException('An erased address cannot become a default');
            }

            foreach ($this->addresses->forAccount($accountId) as $address) {
                if ($address->isDefault && $address->id !== $target->id) {
                    $address->clearDefault();
                    $this->addresses->save($address);
                }
            }

            $target->markDefault();
            $this->addresses->save($target);

            $this->outbox->publish('Account', $accountId, 'AddressDefaultChanged', [
                'account_id' => $accountId,
                'address_id' => $target->id,
                'at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return $target;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
