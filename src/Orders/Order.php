<?php

declare(strict_types=1);

namespace NasTech\Orders;

use NasTech\SharedKernel\IllegalTransition;
use NasTech\SharedKernel\Money;
use NasTech\SharedKernel\StateMachine;

/**
 * Order aggregate.
 *
 * The state machine is the load-bearing part. Note what is absent from
 * TRANSITIONS: there is no event that reaches PAID except PAYMENT_RECORDED, and
 * no event named after a handover appears anywhere in this table. v1.0 line 545
 * says a handover PIN must not mark an order paid; here that is not a rule an
 * engineer has to remember, it is the only path the machine permits.
 */
final class Order
{
    public const AWAITING_PAYMENT = 'AWAITING_PAYMENT';
    public const PAID = 'PAID';
    public const HANDOVER_SCHEDULED = 'HANDOVER_SCHEDULED';
    public const HANDOVER_CONFIRMED = 'HANDOVER_CONFIRMED';
    public const COMPLETED = 'COMPLETED';
    public const CANCELLED = 'CANCELLED';
    public const REFUND_PENDING = 'REFUND_PENDING';
    public const REFUNDED = 'REFUNDED';
    public const IN_DISPUTE = 'IN_DISPUTE';

    public const EV_PAYMENT_RECORDED = 'PAYMENT_RECORDED';
    public const EV_HANDOVER_SCHEDULED = 'HANDOVER_SCHEDULED';
    public const EV_HANDOVER_CONFIRMED = 'HANDOVER_CONFIRMED';
    public const EV_ORDER_COMPLETED = 'ORDER_COMPLETED';
    public const EV_CANCELLED = 'CANCELLED';
    public const EV_REFUND_INITIATED = 'REFUND_INITIATED';
    public const EV_REFUND_SETTLED = 'REFUND_SETTLED';
    public const EV_DISPUTE_OPENED = 'DISPUTE_OPENED';
    public const EV_DISPUTE_RESOLVED_TO_SELLER = 'DISPUTE_RESOLVED_TO_SELLER';

    public const TRANSITIONS = [
        self::AWAITING_PAYMENT => [
            self::EV_PAYMENT_RECORDED => self::PAID,
            self::EV_CANCELLED => self::CANCELLED,
        ],
        self::PAID => [
            self::EV_HANDOVER_SCHEDULED => self::HANDOVER_SCHEDULED,
            self::EV_REFUND_INITIATED => self::REFUND_PENDING,
            self::EV_DISPUTE_OPENED => self::IN_DISPUTE,
            self::EV_CANCELLED => self::CANCELLED,
        ],
        self::HANDOVER_SCHEDULED => [
            self::EV_HANDOVER_CONFIRMED => self::HANDOVER_CONFIRMED,
            self::EV_REFUND_INITIATED => self::REFUND_PENDING,
            self::EV_DISPUTE_OPENED => self::IN_DISPUTE,
        ],
        self::HANDOVER_CONFIRMED => [
            self::EV_ORDER_COMPLETED => self::COMPLETED,
            self::EV_REFUND_INITIATED => self::REFUND_PENDING,
            self::EV_DISPUTE_OPENED => self::IN_DISPUTE,
        ],
        self::REFUND_PENDING => [
            self::EV_REFUND_SETTLED => self::REFUNDED,
        ],
        self::IN_DISPUTE => [
            self::EV_DISPUTE_RESOLVED_TO_SELLER => self::HANDOVER_CONFIRMED,
            self::EV_REFUND_INITIATED => self::REFUND_PENDING,
        ],
        self::COMPLETED => [],
        self::CANCELLED => [],
        self::REFUNDED => [],
    ];

    /** @var list<string> */
    private array $transitionsApplied = [];

    /**
     * The version this aggregate was loaded with. Optimistic locking compares the
     * stored row against *that*, not against the current version minus one, so a
     * transaction may make several changes to one order and still be safe.
     */
    private int $loadedVersion;

    public function __construct(
        public readonly string $id,
        public readonly string $listingId,
        public readonly string $buyerId,
        public readonly string $sellerId,
        public readonly string $category,
        public readonly Money $itemPrice,
        public readonly Money $buyerTotal,
        public string $status,
        public int $version = 1,
        public readonly ?\DateTimeImmutable $createdAt = null,
        public ?\DateTimeImmutable $paidAt = null,
        public ?\DateTimeImmutable $handoverConfirmedAt = null,
        public ?\DateTimeImmutable $completedAt = null,
        public ?string $handoverTokenId = null,
    ) {
        $this->loadedVersion = $this->version;
    }

    public function loadedVersion(): int
    {
        return $this->loadedVersion;
    }

    public static function machine(): StateMachine
    {
        return new StateMachine('Order', self::TRANSITIONS);
    }

    /**
     * @throws IllegalTransition when the event is not valid from the current state
     */
    public function apply(string $event): void
    {
        $next = self::machine()->next($this->status, $event);
        $this->status = $next;
        $this->version++;
        $this->transitionsApplied[] = $event;
    }

    /**
     * Point the order at the token that will attest to its handover.
     *
     * This bumps the version even though it is not a state transition: it changes
     * which token can confirm this order, so a concurrent reissue must collide
     * rather than silently win.
     */
    public function attachHandoverToken(string $tokenId): void
    {
        $this->handoverTokenId = $tokenId;
        $this->version++;
    }

    public function can(string $event): bool
    {
        return self::machine()->can($this->status, $event);
    }

    /**
     * @return list<string>
     */
    public function transitionsApplied(): array
    {
        return $this->transitionsApplied;
    }

    public function hasReachedPaid(): bool
    {
        return in_array(self::EV_PAYMENT_RECORDED, $this->transitionsApplied, true);
    }

    /**
     * True when this transition is the one that obliges a ledger entry.
     *
     * REFUND_INITIATED is deliberately absent: opening a refund does not move
     * money, settling one does. Treating the request as the event is how a
     * cancelled refund leaves a phantom debit in the ledger.
     */
    public static function isMoneyBearing(string $event): bool
    {
        return in_array($event, [
            self::EV_PAYMENT_RECORDED,
            self::EV_ORDER_COMPLETED,
            self::EV_REFUND_SETTLED,
        ], true);
    }

    public function isTerminal(): bool
    {
        return self::TRANSITIONS[$this->status] === [];
    }
}
