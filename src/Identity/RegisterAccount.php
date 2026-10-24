<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Register a phone-first account. No password, no proven channel, no tier.
 *
 * Those three are separate proofs established by separate commands, and a
 * registration command that could preset any of them would be the hole that
 * lets a "grant" appear without a grantor or a "verified" appear without an
 * SMS. The phone number is normalised to E.164 before the row exists, and the
 * unique index on phone_e164 is what makes one number one account.
 */
final class RegisterAccount
{
    public function __construct(
        private readonly AccountRepository $accounts,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(string $rawPhone, ?string $displayName = null): Account
    {
        $phone = PhoneNumber::fromString($rawPhone);
        $now = $this->clock->now();

        $this->uow->begin();
        try {
            $account = Account::register(Id::generate('acc')->value(), $phone, $displayName, $now);
            $this->accounts->save($account);

            $this->outbox->publish('Account', $account->id, 'AccountRegistered', [
                'account_id' => $account->id,
                'role' => $account->role,
                'registered_at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return $account;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
