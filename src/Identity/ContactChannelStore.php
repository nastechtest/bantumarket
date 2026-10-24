<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Persistence\Store;

/**
 * Contact channels by account and by (type, target).
 *
 * The unique index on (type, target) is the rule that a phone number or
 * mailbox belongs to one account. It is an index rather than a pre-check for
 * the usual reason: a pre-check has a window between reading and writing.
 */
final class ContactChannelStore
{
    public const TABLE = 'contact_channels';

    public function __construct(private readonly Store $store)
    {
    }

    public function save(ContactChannel $channel): void
    {
        $row = $channel->toArray();
        if ($this->store->find(self::TABLE, $channel->id) === null) {
            $this->store->insert(self::TABLE, $row);

            return;
        }
        $this->store->update(self::TABLE, $row);
    }

    public function find(string $id): ?ContactChannel
    {
        $row = $this->store->find(self::TABLE, $id);

        return $row === null ? null : ContactChannel::fromRow($row);
    }

    public function require(string $id): ContactChannel
    {
        $channel = $this->find($id);
        if ($channel === null) {
            throw new \RuntimeException("Unknown contact channel: {$id}");
        }

        return $channel;
    }

    /**
     * @return list<ContactChannel>
     */
    public function forAccount(string $accountId): array
    {
        $channels = [];
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['account_id'] === $accountId) {
                $channels[] = ContactChannel::fromRow($row);
            }
        }

        return $channels;
    }

    public function findByTarget(ChannelType $type, string $target): ?ContactChannel
    {
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['type'] === $type->value && (string) $row['target'] === $target) {
                return ContactChannel::fromRow($row);
            }
        }

        return null;
    }
}
