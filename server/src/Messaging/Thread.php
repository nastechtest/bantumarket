<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * The thread aggregate: one conversation, bound to exactly one listing or order.
 *
 * Why one context and not a free-floating chat: a thread that is not about a thing
 * cannot be attached to a dispute, exported as evidence or closed when the thing is
 * sold, so it becomes a private channel the platform cannot reason about. The
 * context key is also the deduplication key — two people who tap "message seller"
 * twice on the same listing get the same thread, enforced by a unique index rather
 * than a read-then-write.
 *
 * Version is the optimistic CAS token. Every append advances it; the unit of work
 * writes the thread and the message together, so a sequence number is allocated
 * exactly once even when two sends race.
 */
final class Thread
{
    private function __construct(
        public readonly string $id,
        public readonly string $contextKey,
        public readonly ?string $listingId,
        public readonly ?string $orderId,
        public readonly string $buyerId,
        public readonly string $sellerId,
        public readonly \DateTimeImmutable $createdAt,
        private ThreadStatus $status,
        private int $messageCount,
        private int $version,
        private ?\DateTimeImmutable $lastMessageAt,
        private ?\DateTimeImmutable $closedAt,
        private ?string $closedReason,
    ) {
    }

    public static function open(
        string $id,
        string $buyerId,
        string $sellerId,
        ?string $listingId,
        ?string $orderId,
        \DateTimeImmutable $at,
    ): self {
        if ($buyerId === $sellerId) {
            throw new MessageRefused('A thread needs two different accounts; this one names the same account twice');
        }
        if ($listingId === null && $orderId === null) {
            throw new MessageRefused('Every thread is about a listing or an order, so one of them must be named');
        }
        if ($orderId !== null) {
            // An order is the stronger context: it names both parties at the moment
            // of sale, and a thread about an order must not silently detach from it.
            $contextKey = 'order:' . $orderId;
        } else {
            $contextKey = 'listing:' . $listingId;
        }

        return new self(
            id: $id,
            contextKey: $contextKey,
            listingId: $listingId,
            orderId: $orderId,
            buyerId: $buyerId,
            sellerId: $sellerId,
            createdAt: $at,
            status: ThreadStatus::OPEN,
            messageCount: 0,
            version: 1,
            lastMessageAt: null,
            closedAt: null,
            closedReason: null,
        );
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            contextKey: (string) $row['context_key'],
            listingId: $row['listing_id'] === null ? null : (string) $row['listing_id'],
            orderId: $row['order_id'] === null ? null : (string) $row['order_id'],
            buyerId: (string) $row['buyer_id'],
            sellerId: (string) $row['seller_id'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
            status: ThreadStatus::from((string) $row['status']),
            messageCount: (int) $row['message_count'],
            version: (int) $row['version'],
            lastMessageAt: $row['last_message_at'] === null
                ? null
                : new \DateTimeImmutable((string) $row['last_message_at']),
            closedAt: $row['closed_at'] === null ? null : new \DateTimeImmutable((string) $row['closed_at']),
            closedReason: $row['closed_reason'] === null ? null : (string) $row['closed_reason'],
        );
    }

    public function version(): int
    {
        return $this->version;
    }

    public function status(): ThreadStatus
    {
        return $this->status;
    }

    public function messageCount(): int
    {
        return $this->messageCount;
    }

    public function lastMessageAt(): ?\DateTimeImmutable
    {
        return $this->lastMessageAt;
    }

    public function closedAt(): ?\DateTimeImmutable
    {
        return $this->closedAt;
    }

    public function closedReason(): ?string
    {
        return $this->closedReason;
    }

    public function isParty(string $accountId): bool
    {
        return $accountId === $this->buyerId || $accountId === $this->sellerId;
    }

    /**
     * The inbox sort key: last activity, then id as a tie-break, in one text value
     * so the SQL and the in-memory model can page identically with a keyset.
     */
    public function activityKey(): string
    {
        $at = $this->lastMessageAt ?? $this->createdAt;

        return $at->format(\DateTimeInterface::ATOM) . '|' . $this->id;
    }

    /**
     * The per-fetch authorisation. Called for every message page and every export,
     * not once when the thread is opened: an order can be cancelled, a report can
     * remove a party's access path, and a token issued yesterday must not outlive
     * either of those facts.
     *
     * @throws NotAParticipant when the account is neither buyer nor seller
     */
    public function requireParty(string $accountId): void
    {
        if (!$this->isParty($accountId)) {
            throw new NotAParticipant(sprintf(
                'Account %s is not a party to thread %s; a thread is visible only to its buyer and its seller',
                $accountId,
                $this->id,
            ));
        }
    }

    public function peerOf(string $accountId): string
    {
        $this->requireParty($accountId);

        return $accountId === $this->buyerId ? $this->sellerId : $this->buyerId;
    }

    /**
     * Allocate the next message sequence. Called inside the same transaction as
     * the message insert; the repository's CAS on version is what makes two racers
     * produce one winner and one StaleThreadVersion, not two message 7s.
     */
    public function recordMessage(\DateTimeImmutable $at): int
    {
        if ($this->status !== ThreadStatus::OPEN) {
            throw new MessageRefused('This thread is closed; a new message cannot reopen it');
        }
        $this->messageCount++;
        $this->version++;
        $this->lastMessageAt = $at;

        return $this->messageCount;
    }

    public function close(string $reason, \DateTimeImmutable $at): void
    {
        if ($this->status === ThreadStatus::CLOSED) {
            return;
        }
        $reason = trim($reason);
        if ($reason === '') {
            throw new MessageRefused('Closing a thread states a reason; the parties are told why writes stopped');
        }
        $this->status = ThreadStatus::CLOSED;
        $this->closedAt = $at;
        $this->closedReason = $reason;
        $this->version++;
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'context_key' => $this->contextKey,
            'listing_id' => $this->listingId,
            'order_id' => $this->orderId,
            'buyer_id' => $this->buyerId,
            'seller_id' => $this->sellerId,
            'status' => $this->status->value,
            'message_count' => $this->messageCount,
            'version' => $this->version,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
            'last_message_at' => $this->lastMessageAt?->format(\DateTimeInterface::ATOM),
            'closed_at' => $this->closedAt?->format(\DateTimeInterface::ATOM),
            'closed_reason' => $this->closedReason,
            'activity_key' => $this->activityKey(),
        ];
    }

    /**
     * The pull-based inbox row. No message body: the client fetches the page.
     *
     * @return array<string,mixed>
     */
    public function toSummary(): array
    {
        return [
            'id' => $this->id,
            'listing_id' => $this->listingId,
            'order_id' => $this->orderId,
            'counterparty_id' => null,
            'status' => $this->status->value,
            'message_count' => $this->messageCount,
            'last_message_at' => $this->lastMessageAt?->format(\DateTimeInterface::ATOM),
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }
}
