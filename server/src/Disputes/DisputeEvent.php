<?php

declare(strict_types=1);

namespace NasTech\Disputes;

use NasTech\Orders\Order;

/**
 * One entry on a case's own chronology. Append-only, and the answer to a question the
 * buyer UI asks directly: `dispute-transport.ts` demands a `moneyBearing` flag on every
 * timeline event, because a timeline that renders "refund requested" identically to
 * "refund settled" tells a seller they have been debited when nothing has moved.
 *
 * The flag is not this module's opinion. Each kind names the order-ladder event it
 * corresponds to, and `Order::isMoneyBearing()` — which already decides that
 * `REFUND_INITIATED` books nothing while `REFUND_SETTLED` does — supplies the answer. If
 * Orders ever moves a state onto that list, every dispute timeline follows automatically;
 * if this file had its own copy of the rule, the two would drift and the UI would lie.
 *
 * A case event is *not* an outbox message. The outbox is delivery state, and
 * `delivered_at` gets rewritten by a dispatcher; a chronology that a worker's retry can
 * edit is not evidence of what a party was told.
 */
final class DisputeEvent
{
    public const TABLE = 'dispute_case_events';

    public const KIND_CASE_OPENED = 'CASE_OPENED';
    public const KIND_EVIDENCE_WINDOW_OPENED = 'EVIDENCE_WINDOW_OPENED';
    public const KIND_EVIDENCE_ATTACHED = 'EVIDENCE_ATTACHED';
    public const KIND_STATEMENT_AMENDED = 'STATEMENT_AMENDED';
    public const KIND_PARTY_RESPONDED = 'PARTY_RESPONDED';
    public const KIND_REVIEW_STARTED = 'REVIEW_STARTED';
    public const KIND_QUESTION_ASKED = 'QUESTION_ASKED';
    public const KIND_SLA_ADJUSTED = 'SLA_ADJUSTED';
    public const KIND_LISTING_EDITED_AFTER_OPEN = 'LISTING_EDITED_AFTER_OPEN';
    public const KIND_DECISION_PROPOSED = 'DECISION_PROPOSED';
    public const KIND_DECISION_COMMITTED = 'DECISION_COMMITTED';
    public const KIND_DECISION_DECLINED = 'DECISION_DECLINED';
    public const KIND_ESCALATED = 'ESCALATED';
    public const KIND_RETURN_REQUESTED = 'RETURN_REQUESTED';
    public const KIND_RETURN_RECEIVED = 'RETURN_RECEIVED';
    public const KIND_MONEY_INSTRUCTED = 'MONEY_INSTRUCTED';
    public const KIND_MONEY_BOOKED = 'MONEY_BOOKED';
    public const KIND_ORDER_RELEASED_TO_SELLER = 'ORDER_RELEASED_TO_SELLER';
    public const KIND_REOPENED = 'REOPENED';
    public const KIND_CLOSED = 'CLOSED';
    public const KIND_WITHDRAWN = 'WITHDRAWN';

    /**
     * kind => the ladder event it stands for, or null when it stands for no order change.
     *
     * @var array<string, string|null>
     */
    private const LADDER_EVENT = [
        self::KIND_CASE_OPENED => Order::EV_DISPUTE_OPENED,
        self::KIND_EVIDENCE_WINDOW_OPENED => null,
        self::KIND_EVIDENCE_ATTACHED => null,
        self::KIND_STATEMENT_AMENDED => null,
        self::KIND_PARTY_RESPONDED => null,
        self::KIND_REVIEW_STARTED => null,
        self::KIND_QUESTION_ASKED => null,
        self::KIND_SLA_ADJUSTED => null,
        self::KIND_LISTING_EDITED_AFTER_OPEN => null,
        self::KIND_DECISION_PROPOSED => null,
        self::KIND_DECISION_COMMITTED => null,
        self::KIND_DECISION_DECLINED => null,
        self::KIND_ESCALATED => null,
        self::KIND_RETURN_REQUESTED => null,
        self::KIND_RETURN_RECEIVED => null,
        self::KIND_MONEY_INSTRUCTED => Order::EV_REFUND_INITIATED,
        self::KIND_MONEY_BOOKED => Order::EV_REFUND_SETTLED,
        self::KIND_ORDER_RELEASED_TO_SELLER => Order::EV_DISPUTE_RESOLVED_TO_SELLER,
        self::KIND_REOPENED => null,
        self::KIND_CLOSED => null,
        self::KIND_WITHDRAWN => null,
    ];

    /** @var list<string> */
    public const KINDS = [
        self::KIND_CASE_OPENED,
        self::KIND_EVIDENCE_WINDOW_OPENED,
        self::KIND_EVIDENCE_ATTACHED,
        self::KIND_STATEMENT_AMENDED,
        self::KIND_PARTY_RESPONDED,
        self::KIND_REVIEW_STARTED,
        self::KIND_QUESTION_ASKED,
        self::KIND_SLA_ADJUSTED,
        self::KIND_LISTING_EDITED_AFTER_OPEN,
        self::KIND_DECISION_PROPOSED,
        self::KIND_DECISION_COMMITTED,
        self::KIND_DECISION_DECLINED,
        self::KIND_ESCALATED,
        self::KIND_RETURN_REQUESTED,
        self::KIND_RETURN_RECEIVED,
        self::KIND_MONEY_INSTRUCTED,
        self::KIND_MONEY_BOOKED,
        self::KIND_ORDER_RELEASED_TO_SELLER,
        self::KIND_REOPENED,
        self::KIND_CLOSED,
        self::KIND_WITHDRAWN,
    ];

    public function __construct(
        public readonly string $id,
        public readonly string $kind,
        public readonly string $actorRole,
        public readonly string $actorId,
        public readonly string $body,
        public readonly int $sequence,
        public readonly \DateTimeImmutable $occurredAt,
        public readonly ?string $idempotencyKey = null,
    ) {
        if (!in_array($kind, self::KINDS, true)) {
            throw new DisputeRuleViolation(sprintf(
                'Unknown case event kind "%s". The timeline is bounded by the vocabulary the DDL admits.',
                $kind,
            ));
        }
        if (trim($body) === '') {
            throw new DisputeRuleViolation("Case event {$kind} has no body; a timeline entry that says nothing "
                . 'is the row that gets read as "nothing happened"');
        }
        if (!in_array($actorRole, [DisputeCase::ROLE_BUYER, DisputeCase::ROLE_SELLER, DisputeCase::ROLE_STAFF], true)) {
            throw new DisputeRuleViolation("Unknown actor role on case event: {$actorRole}");
        }
    }

    public function moneyBearing(): bool
    {
        $ladderEvent = self::LADDER_EVENT[$this->kind] ?? null;

        // No order change means no money change, which is the same rule the ledger applies:
        // an event that does not move order state cannot be the one that moved the money.
        return $ladderEvent !== null && Order::isMoneyBearing($ladderEvent);
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(string $caseId): array
    {
        return [
            'id' => $this->id,
            'case_id' => $caseId,
            'sequence' => $this->sequence,
            'kind' => $this->kind,
            'actor_role' => $this->actorRole,
            'actor_id' => $this->actorId,
            'body' => $this->body,
            'money_bearing' => $this->moneyBearing(),
            'occurred_at' => $this->occurredAt->format(\DateTimeInterface::ATOM),
            'idempotency_key' => $this->idempotencyKey,
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            kind: (string) $row['kind'],
            actorRole: (string) $row['actor_role'],
            actorId: (string) $row['actor_id'],
            body: (string) $row['body'],
            sequence: (int) $row['sequence'],
            occurredAt: new \DateTimeImmutable((string) $row['occurred_at']),
            idempotencyKey: $row['idempotency_key'] === null ? null : (string) $row['idempotency_key'],
        );
    }
}
