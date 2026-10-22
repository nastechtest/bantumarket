<?php

declare(strict_types=1);

namespace NasTech\Handover;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Persistence\Store;

final class HandoverTokenStore
{
    public const TABLE = 'handover_tokens';

    public function __construct(
        private readonly Store $store,
        private readonly Clock $clock,
    ) {
    }

    public function save(HandoverToken $token): void
    {
        $row = $token->toArray();
        $existing = $this->store->find(self::TABLE, $token->id);
        if ($existing === null) {
            $this->store->insert(self::TABLE, $row);

            return;
        }
        $this->store->update(self::TABLE, $row);
    }

    public function require(string $id): HandoverToken
    {
        $row = $this->store->find(self::TABLE, $id);
        if ($row === null) {
            throw new HandoverRejected("Unknown handover token: {$id}");
        }

        return HandoverToken::fromRow($row);
    }

    /**
     * The active token for an order, if any. Against PostgreSQL this is a partial
     * unique index on (order_id) WHERE revoked = false; emulated here by picking
     * the newest non-revoked, unexpired row.
     */
    public function activeForOrder(string $orderId): ?HandoverToken
    {
        $best = null;
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['order_id'] !== $orderId || (bool) $row['revoked']) {
                continue;
            }
            $token = HandoverToken::fromRow($row);
            if ($token->isExpired($this->clock->now())) {
                continue;
            }
            if ($best === null || $token->issuedAt > $best->issuedAt) {
                $best = $token;
            }
        }

        return $best;
    }

    /**
     * @return list<HandoverToken>
     */
    public function activeTokens(): array
    {
        $now = $this->clock->now();

        return array_values(array_filter(
            array_map(
                static fn (array $row): HandoverToken => HandoverToken::fromRow($row),
                $this->store->all(self::TABLE),
            ),
            static fn (HandoverToken $t): bool => !$t->revoked && !$t->isComplete() && !$t->isExpired($now),
        ));
    }

    public function count(): int
    {
        return count($this->store->all(self::TABLE));
    }
}
