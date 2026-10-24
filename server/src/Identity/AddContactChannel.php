<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Attach a contact channel to an account. It starts unproven with no consent:
 * a channel is not evidence until a code sent to it is redeemed, and asking
 * for consent on an unproven address is asking the wrong person.
 *
 * The unique index on (type, target) makes a number or mailbox belong to one
 * account. The command does not pre-check that; it inserts and lets the index
 * refuse, because a pre-check has a window.
 */
final class AddContactChannel
{
    public function __construct(
        private readonly AccountRepository $accounts,
        private readonly ContactChannelStore $channels,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(string $accountId, ChannelType $type, string $target): ContactChannel
    {
        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $account = $this->accounts->require($accountId);
            if (!$account->isActive()) {
                throw new \DomainException('An inactive account cannot add a contact channel');
            }

            $channel = ContactChannel::create(Id::generate('chn')->value(), $accountId, $type, $target, $now);
            $this->channels->save($channel);

            $this->outbox->publish('Account', $accountId, 'ContactChannelAdded', [
                'account_id' => $accountId,
                'channel_id' => $channel->id,
                'type' => $type->value,
                // The target itself is personal data and stays out of the
                // event; a consumer that needs it asks the module.
                'added_at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return $channel;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
