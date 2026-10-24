<?php

declare(strict_types=1);

namespace NasTech\Disputes;

use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Money;

/**
 * A dispute case: the assertion, the frozen evidence, the review and the
 * money instruction a decision produces.
 *
 * Three facts shape this aggregate.
 *
 * 1. It exists only against an order in a state where money has moved and the
 *    item has a history — PAID, HANDOVER_SCHEDULED, HANDOVER_CONFIRMED or
 *    COMPLETED. The list is data (`DISPUTABLE_ORDER_STATES`) and the same list
 *    is a named CHECK in 007_disputes.sql.
 * 2. The listing's condition record is copied in at open and never re-read.
 *    Later edits arrive as separate snapshots, so a seller who rewords a
 *    disclosure after a case opens changes the case's timeline and nothing
 *    else. `conditionAtSale()` always returns sequence 1.
 * 3. It never moves money. A committed decision produces a
 *    DisputeMoneyInstruction that the command publishes on the outbox; the
 *    ledger belongs to Settlements.
 *
 * Concurrency is optimistic CAS on `version`, checked by the repository and
 * backstopped by `shared.assert_order_version_monotonic()` in the DDL.
 */
final class DisputeCase
{
    public const TABLE = 'dispute_cases';

    public const ROLE_BUYER = 'buyer';
    public const ROLE_SELLER = 'seller';
    public const ROLE_STAFF = 'staff';

    public const AWAITING_BUYER = 'buyer';
    public const AWAITING_SELLER = 'seller';
    public const AWAITING_STAFF = 'staff';
    public const AWAITING_NOBODY = 'nobody';

    /** @var list<string> */
    public const AWAITING_VALUES = [
        self::AWAITING_BUYER,
        self::AWAITING_SELLER,
        self::AWAITING_STAFF,
        self::AWAITING_NOBODY,
    ];

    /**
     * The only order states a dispute may be opened against. Transcribed from
     * brief 46 and mirrored by `only_disputable_states_are_admitted` in 007.
     * IN_DISPUTE is deliberately absent: that state means a case already owns
     * the order's slot, and a second case would be a second decision about the
     * same money.
     *
     * @var list<string>
     */
    public const DISPUTABLE_ORDER_STATES = ['PAID', 'HANDOVER_SCHEDULED', 'HANDOVER_CONFIRMED', 'COMPLETED'];

    public const EVIDENCE_WINDOW = 'P7D';
    public const RESOLUTION_WINDOW = 'P14D';

    public const MAX_EVIDENCE_FILES = 24;
    public const MAX_EVIDENCE_BYTES = 250_000_000;

    public readonly string $id;
    public readonly string $orderId;
    public readonly string $listingId;
    public readonly string $buyerId;
    public readonly string $sellerId;
    public readonly string $openedBy;
    public readonly string $openedByAccountId;
    public readonly string $orderStateAtOpen;
    public readonly ClaimScope $claimScope;
    public readonly string $severity;
    public readonly string $reasonCode;
    public readonly string $statement;
    public readonly Money $ceiling;
    public readonly string $currency;
    public readonly \DateTimeImmutable $openedAt;
    public readonly \DateTimeImmutable $evidenceDueAt;
    public readonly \DateTimeImmutable $slaDueAt;
    public readonly ?string $idempotencyKey;

    public DisputeState $state;
    public string $awaiting;
    public ?string $openSlot;
    public Money $instructedRefund;
    public Money $residual;
    public ?string $escalationCode;
    public ?string $escalationNote;
    public int $version;

    /** @var list<ConditionSnapshot> */
    private array $snapshots = [];

    /** @var list<Claim> */
    private array $claims = [];

    /** @var list<EvidenceReference> */
    private array $evidence = [];

    /** @var list<DisputeDecision> */
    private array $decisions = [];

    /** @var list<DisputeEvent> */
    private array $events = [];

    private int $loadedVersion;

    /**
     * @param list<ConditionSnapshot> $snapshots
     * @param list<Claim>             $claims
     */
    private function __construct(
        string $id,
        string $orderId,
        string $listingId,
        string $buyerId,
        string $sellerId,
        string $openedBy,
        string $openedByAccountId,
        DisputeState $state,
        string $orderStateAtOpen,
        ClaimScope $claimScope,
        string $severity,
        string $reasonCode,
        string $awaiting,
        ?string $openSlot,
        string $statement,
        Money $ceiling,
        Money $instructedRefund,
        Money $residual,
        ?string $escalationCode,
        ?string $escalationNote,
        int $version,
        \DateTimeImmutable $openedAt,
        \DateTimeImmutable $evidenceDueAt,
        \DateTimeImmutable $slaDueAt,
        ?string $idempotencyKey,
        array $snapshots,
        array $claims,
    ) {
        $this->id = $id;
        $this->orderId = $orderId;
        $this->listingId = $listingId;
        $this->buyerId = $buyerId;
        $this->sellerId = $sellerId;
        $this->openedBy = $openedBy;
        $this->openedByAccountId = $openedByAccountId;
        $this->state = $state;
        $this->orderStateAtOpen = $orderStateAtOpen;
        $this->claimScope = $claimScope;
        $this->severity = $severity;
        $this->reasonCode = $reasonCode;
        $this->awaiting = $awaiting;
        $this->openSlot = $openSlot;
        $this->statement = $statement;
        $this->ceiling = $ceiling;
        $this->currency = $ceiling->currency;
        $this->instructedRefund = $instructedRefund;
        $this->residual = $residual;
        $this->escalationCode = $escalationCode;
        $this->escalationNote = $escalationNote;
        $this->version = $version;
        $this->openedAt = $openedAt;
        $this->evidenceDueAt = $evidenceDueAt;
        $this->slaDueAt = $slaDueAt;
        $this->idempotencyKey = $idempotencyKey;
        $this->snapshots = $snapshots;
        $this->claims = $claims;
        $this->loadedVersion = $version;
    }

    /**
     * Open a case, copying the condition record in as sequence 1.
     *
     * @param list<Claim> $claims
     */
    public static function open(
        string $id,
        string $orderId,
        string $listingId,
        string $buyerId,
        string $sellerId,
        string $orderStateAtOpen,
        string $openedBy,
        string $openedByAccountId,
        string $statement,
        Money $holding,
        ConditionSnapshot $atOpen,
        array $claims,
        \DateTimeImmutable $openedAt,
        \DateTimeImmutable $evidenceDueAt,
        \DateTimeImmutable $slaDueAt,
        ?string $idempotencyKey = null,
    ): self {
        if ($id === '' || $orderId === '' || $listingId === '') {
            throw new DisputeRuleViolation('A case names itself, its order and its listing');
        }
        if ($buyerId === $sellerId) {
            throw new DisputeRuleViolation('A case cannot be opened on an order where buyer and seller are the same account');
        }
        if (!in_array($orderStateAtOpen, self::DISPUTABLE_ORDER_STATES, true)) {
            throw new OrderNotDisputable(
                sprintf(
                    'Order %s is not in a state that admits a dispute. A dispute exists against a paid order, '
                    . 'not against an intention to pay. Admissible: %s',
                    $orderId,
                    implode(', ', self::DISPUTABLE_ORDER_STATES),
                ),
                'ORDER_STATE_NOT_DISPUTABLE',
            );
        }
        if (!in_array($openedBy, [self::ROLE_BUYER, self::ROLE_SELLER], true)) {
            throw new DisputeAccessDenied('Only the buyer or the seller on the order may open a dispute on it');
        }
        $expectedOpener = $openedBy === self::ROLE_BUYER ? $buyerId : $sellerId;
        if ($openedByAccountId !== $expectedOpener) {
            throw new DisputeAccessDenied('The account opening the case is not the party it names');
        }
        if (trim($statement) === '') {
            throw new DisputeRuleViolation(
                'A dispute needs a written statement. "Something is wrong" gives a resolver nothing to compare '
                . 'against the listing and nothing for the other party to answer.'
            );
        }
        if (!$holding->isPositive()) {
            throw new DisputeRuleViolation('An order with nothing held cannot be disputed; there would be no authority to decide against');
        }
        if ($claims === []) {
            throw new DisputeRuleViolation('A case asserts at least one claim; without one there is nothing to adjudicate');
        }
        $seenKinds = [];
        foreach ($claims as $claim) {
            if (!$claim instanceof Claim) {
                throw new DisputeRuleViolation('A case carries claims, not free-form reasons');
            }
            if (isset($seenKinds[$claim->kind->value])) {
                throw new DisputeRuleViolation(sprintf(
                    'Claim kind "%s" appears twice on one case; the set is what the decision rule reads',
                    $claim->kind->value,
                ));
            }
            $seenKinds[$claim->kind->value] = true;
        }
        if ($atOpen->sequence !== 1 || $atOpen->origin !== ConditionSnapshot::ORIGIN_AT_OPEN) {
            throw new DisputeRuleViolation('The condition record is frozen by the snapshot taken at open (sequence 1)');
        }
        if ($atOpen->record->listingId !== $listingId) {
            throw new DisputeRuleViolation('The condition record belongs to a different listing than the case');
        }
        if ($atOpen->record->claimScope->value !== $atOpen->record->claimScope->value) {
            // Unreachable by construction; kept as a statement of the field that is read.
            throw new DisputeRuleViolation('The claim scope must be the one the listing declared at sale');
        }
        if ($evidenceDueAt <= $openedAt || $slaDueAt <= $openedAt) {
            throw new DisputeRuleViolation('The evidence and resolution deadlines are after the case opens; a deadline in the past is not a promise');
        }
        if ($idempotencyKey !== null && preg_match('/^[A-Za-z0-9_\-:.]{8,96}$/', $idempotencyKey) !== 1) {
            throw new DisputeRuleViolation('An idempotency key is an opaque token of at least eight characters');
        }

        $case = new self(
            id: $id,
            orderId: $orderId,
            listingId: $listingId,
            buyerId: $buyerId,
            sellerId: $sellerId,
            openedBy: $openedBy,
            openedByAccountId: $openedByAccountId,
            state: DisputeState::OPENED,
            orderStateAtOpen: $orderStateAtOpen,
            claimScope: $atOpen->record->claimScope,
            severity: self::severityOf($atOpen->record),
            reasonCode: $claims[0]->kind->value,
            awaiting: $openedBy === self::ROLE_BUYER ? self::AWAITING_SELLER : self::AWAITING_BUYER,
            openSlot: $orderId,
            statement: $statement,
            ceiling: $holding,
            instructedRefund: Money::zero($holding->currency),
            residual: $holding,
            escalationCode: null,
            escalationNote: null,
            version: 1,
            openedAt: $openedAt,
            evidenceDueAt: $evidenceDueAt,
            slaDueAt: $slaDueAt,
            idempotencyKey: $idempotencyKey,
            snapshots: [$atOpen],
            claims: array_values($claims),
        );

        $case->appendEvent(
            DisputeEvent::KIND_CASE_OPENED,
            $openedBy,
            $openedByAccountId,
            sprintf(
                'Case opened. Evidence closes %s; the platform aims to decide by %s.',
                $evidenceDueAt->format('Y-m-d'),
                $slaDueAt->format('Y-m-d'),
            ),
            $openedAt,
        );

        return $case;
    }

    /**
     * Rehydrate a case from its rows. No business rule runs here: the row is a
     * fact the store already accepted, and re-validating a historical row with
     * today's rule is how a migration becomes impossible.
     *
     * @param list<ConditionSnapshot> $snapshots
     * @param list<Claim>             $claims
     * @param list<EvidenceReference> $evidence
     * @param list<DisputeDecision>   $decisions
     * @param list<DisputeEvent>      $events
     *
     * @param array<string,mixed> $row
     */
    public static function restore(
        array $row,
        array $snapshots,
        array $claims,
        array $evidence,
        array $decisions,
        array $events,
    ): self {
        $case = new self(
            id: (string) $row['id'],
            orderId: (string) $row['order_id'],
            listingId: (string) $row['listing_id'],
            buyerId: (string) $row['buyer_id'],
            sellerId: (string) $row['seller_id'],
            openedBy: (string) $row['opened_by'],
            openedByAccountId: (string) $row['opened_by_account_id'],
            state: DisputeState::from((string) $row['lifecycle_state']),
            orderStateAtOpen: (string) $row['order_state_at_open'],
            claimScope: ClaimScope::fromWire((string) $row['claim_scope']),
            severity: (string) $row['severity'],
            reasonCode: (string) $row['reason_code'],
            awaiting: (string) $row['awaiting'],
            openSlot: $row['open_slot'] === null ? null : (string) $row['open_slot'],
            statement: (string) $row['statement'],
            ceiling: Money::fromCents((int) $row['ceiling_cents'], (string) $row['currency']),
            instructedRefund: Money::fromCents((int) $row['instructed_refund_cents'], (string) $row['currency']),
            residual: Money::fromCents((int) $row['residual_cents'], (string) $row['currency']),
            escalationCode: $row['escalation_code'] === null ? null : (string) $row['escalation_code'],
            escalationNote: $row['escalation_note'] === null ? null : (string) $row['escalation_note'],
            version: (int) $row['version'],
            openedAt: new \DateTimeImmutable((string) $row['opened_at']),
            evidenceDueAt: new \DateTimeImmutable((string) $row['evidence_due_at']),
            slaDueAt: new \DateTimeImmutable((string) $row['sla_due_at']),
            idempotencyKey: $row['idempotency_key'] === null ? null : (string) $row['idempotency_key'],
            snapshots: $snapshots,
            claims: $claims,
        );
        $case->evidence = array_values($evidence);
        $case->decisions = array_values($decisions);
        $case->events = array_values($events);
        $case->loadedVersion = (int) $row['version'];

        return $case;
    }

    public function loadedVersion(): int
    {
        return $this->loadedVersion;
    }

    public function beginEvidenceWindow(\DateTimeImmutable $now): void
    {
        if ($this->state !== DisputeState::OPENED) {
            throw new DisputeRuleViolation('The evidence window opens once, from the opened state');
        }
        $this->state = $this->state->next(DisputeState::EV_OPEN_EVIDENCE_WINDOW);
        $this->awaiting = $this->openedBy === self::ROLE_BUYER ? self::AWAITING_SELLER : self::AWAITING_BUYER;
        $this->appendEvent(
            DisputeEvent::KIND_EVIDENCE_WINDOW_OPENED,
            $this->openedBy,
            $this->openedByAccountId,
            sprintf('Evidence window open until %s.', $this->evidenceDueAt->format('Y-m-d')),
            $now,
        );
        $this->version++;
    }

    /**
     * @return list<Claim>
     */
    public function claims(): array
    {
        return $this->claims;
    }

    public function hasUnadjudicableClaim(): bool
    {
        foreach ($this->claims as $claim) {
            if ($claim->kind->requiresEscalation()) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<ConditionSnapshot>
     */
    public function snapshots(): array
    {
        return $this->snapshots;
    }

    /**
     * The record a decision reads. Sequence 1 is the only answer, whatever the
     * seller wrote afterwards.
     */
    public function conditionAtSale(): ConditionRecord
    {
        return $this->snapshots[0]->record;
    }

    public function latestCondition(): ConditionRecord
    {
        return $this->snapshots[count($this->snapshots) - 1]->record;
    }

    /**
     * @return list<EvidenceReference>
     */
    public function evidence(): array
    {
        return $this->evidence;
    }

    /**
     * @return list<DisputeDecision>
     */
    public function decisions(): array
    {
        return $this->decisions;
    }

    public function latestProposal(): ?DisputeDecision
    {
        foreach (array_reverse($this->decisions) as $decision) {
            if ($decision->isProposal()) {
                return $decision;
            }
        }

        return null;
    }

    public function latestCommittedDecision(): ?DisputeDecision
    {
        foreach (array_reverse($this->decisions) as $decision) {
            if ($decision->isCommitted()) {
                return $decision;
            }
        }

        return null;
    }

    /**
     * @return list<DisputeEvent>
     */
    public function events(): array
    {
        return $this->events;
    }

    public function isParty(string $accountId): bool
    {
        return $accountId === $this->buyerId || $accountId === $this->sellerId;
    }

    public function partyRoleFor(string $accountId): ?string
    {
        return match ($accountId) {
            $this->buyerId => self::ROLE_BUYER,
            $this->sellerId => self::ROLE_SELLER,
            default => null,
        };
    }

    public function attachEvidence(EvidenceReference $evidence, \DateTimeImmutable $now): void
    {
        if (!$this->state->acceptsEvidence()) {
            throw new DisputeRuleViolation(sprintf(
                'Evidence cannot be added while the case is %s. A decision that is already reached cannot be '
                . 'reached again against a new file.',
                $this->state->value,
            ));
        }
        if (!in_array($evidence->ownerRole, [self::ROLE_BUYER, self::ROLE_SELLER, self::ROLE_STAFF], true)) {
            throw new DisputeRuleViolation("Evidence owner role must be buyer, seller or staff; got {$evidence->ownerRole}");
        }
        foreach ($this->evidence as $existing) {
            if ($existing->mediaId === $evidence->mediaId) {
                throw new DisputeRuleViolation(
                    "Media {$evidence->mediaId} is already in this case file; attaching it twice would "
                    . 'inflate the count without adding evidence'
                );
            }
        }
        if (count($this->evidence) >= self::MAX_EVIDENCE_FILES) {
            throw new DisputeRuleViolation(sprintf(
                'This case file already holds the maximum %d evidence files',
                self::MAX_EVIDENCE_FILES,
            ));
        }
        $total = $evidence->bytes;
        foreach ($this->evidence as $existing) {
            $total += $existing->bytes;
        }
        if ($total > self::MAX_EVIDENCE_BYTES) {
            throw new DisputeRuleViolation(sprintf(
                'This case file would hold %d bytes, above the %d-byte ceiling. The written statement remains '
                . 'the evidence of record.',
                $total,
                self::MAX_EVIDENCE_BYTES,
            ));
        }

        $this->evidence[] = $evidence;
        $this->appendEvent(
            DisputeEvent::KIND_EVIDENCE_ATTACHED,
            $evidence->ownerRole,
            $evidence->attachedBy,
            sprintf(
                'Evidence attached: media %s (%s, %d bytes).',
                $evidence->mediaId,
                $evidence->mime,
                $evidence->bytes,
            ),
            $now,
        );
        $this->version++;
    }

    /**
     * Record that the listing changed after the case opened. Returns true when
     * a new snapshot was appended, false when the fingerprint is unchanged.
     * Either way the record at sequence 1 is untouched.
     */
    public function observeListingEdit(ConditionSnapshot $candidate, string $actorId, \DateTimeImmutable $now): bool
    {
        if ($candidate->origin !== ConditionSnapshot::ORIGIN_EDIT_AFTER_OPEN) {
            throw new DisputeRuleViolation('Only an edit-after-open snapshot can arrive after the case is open');
        }
        if ($candidate->sequence !== count($this->snapshots) + 1) {
            throw new DisputeRuleViolation('Condition snapshots are appended in sequence; a gap would hide an edit');
        }
        if ($this->state === DisputeState::CLOSED) {
            throw new DisputeRuleViolation('A closed case accepts no new material; reopen it first');
        }
        if ($candidate->record->listingId !== $this->listingId) {
            throw new DisputeRuleViolation('A listing edit from another listing cannot be recorded on this case');
        }
        if ($candidate->record->fingerprint() === $this->latestCondition()->fingerprint()) {
            return false;
        }

        $changed = $candidate->record->changedFieldsAgainst($this->latestCondition());
        if ($changed === []) {
            return false;
        }

        $this->snapshots[] = new ConditionSnapshot(
            id: $candidate->id,
            sequence: $candidate->sequence,
            origin: $candidate->origin,
            changedFields: $changed,
            capturedAt: $candidate->capturedAt,
            record: $candidate->record,
        );
        $this->appendEvent(
            DisputeEvent::KIND_LISTING_EDITED_AFTER_OPEN,
            self::ROLE_STAFF,
            $actorId,
            sprintf(
                'Listing edited after the case opened. Changed: %s. The condition record at sale is unchanged.',
                implode(', ', $changed),
            ),
            $now,
        );
        $this->version++;

        return true;
    }

    public function startReview(string $actorId, \DateTimeImmutable $now): void
    {
        $this->state = $this->state->next(DisputeState::EV_REVIEW_STARTED);
        $this->awaiting = self::AWAITING_STAFF;
        $this->appendEvent(
            DisputeEvent::KIND_REVIEW_STARTED,
            self::ROLE_STAFF,
            $actorId,
            'A resolver has taken the case.',
            $now,
        );
        $this->version++;
    }

    public function escalate(string $code, string $note, string $actorId, \DateTimeImmutable $now): void
    {
        if (trim($code) === '') {
            throw new DisputeRuleViolation('An escalation names a code');
        }
        if (trim($note) === '') {
            throw new DisputeRuleViolation('An escalation gives a written reason; a code on its own is not reviewable');
        }
        $this->state = $this->state->next(DisputeState::EV_ESCALATED);
        $this->escalationCode = $code;
        $this->escalationNote = $note;
        $this->awaiting = self::AWAITING_STAFF;
        $this->appendEvent(
            DisputeEvent::KIND_ESCALATED,
            self::ROLE_STAFF,
            $actorId,
            sprintf('Escalated (%s): %s', $code, $note),
            $now,
        );
        $this->version++;
    }

    public function proposeDecision(DisputeDecision $proposal, \DateTimeImmutable $now): void
    {
        if ($proposal->isProposal() === false) {
            throw new DisputeRuleViolation('Only a proposed decision can enter the proposal step');
        }
        if (!in_array($this->state, [DisputeState::UNDER_REVIEW, DisputeState::ESCALATED, DisputeState::REOPENED], true)) {
            throw new DisputeRuleViolation(sprintf(
                'A decision can be proposed from review or escalation, not from %s',
                $this->state->value,
            ));
        }
        if ($proposal->caseId !== $this->id) {
            throw new DisputeRuleViolation('The proposal names a different case');
        }
        if ($proposal->sequence !== count($this->decisions) + 1) {
            throw new DisputeRuleViolation('A proposal is appended after every decision already on the case');
        }
        if ($proposal->evidenceHash !== $this->evidenceSetHash()) {
            throw new DisputeRuleViolation(
                'The proposal was written against an evidence set that is not the one on the case now; '
                . 'a decision has to name exactly what it read'
            );
        }
        if (!$proposal->orderHolding->equals($this->ceiling) || !$proposal->previouslyInstructed->equals($this->instructedRefund)) {
            throw new DisputeRuleViolation('The proposal quotes a holding or prior instruction different from this case');
        }
        if ($proposal->hasUnadjudicableClaim !== $this->hasUnadjudicableClaim()) {
            throw new DisputeRuleViolation('The proposal disagrees with the case about whether it contains an unadjudicable claim');
        }

        $latestCommitted = $this->latestCommittedDecision();
        $expectedSupersedes = $latestCommitted?->id;
        if ($proposal->supersedesDecisionId !== $expectedSupersedes) {
            throw new DisputeRuleViolation(
                'A new proposal supersedes the latest committed decision on the case, and no other decision'
            );
        }

        $this->decisions[] = $proposal;
        $this->state = $this->state->next(DisputeState::EV_DECISION_PROPOSED);
        $this->awaiting = self::AWAITING_STAFF;
        $this->appendEvent(
            DisputeEvent::KIND_DECISION_PROPOSED,
            self::ROLE_STAFF,
            $proposal->actorId,
            sprintf(
                'Decision proposed: %s, refund %d cents. Awaiting commitment.',
                $proposal->outcome->value,
                $proposal->refund->cents,
            ),
            $now,
        );
        $this->version++;
    }

    public function commitDecision(DisputeDecision $committed, \DateTimeImmutable $now): void
    {
        if ($this->state !== DisputeState::DECISION_PROPOSED) {
            throw new DisputeRuleViolation('A decision is committed only after a proposal is before the case');
        }
        $proposal = $this->latestProposal();
        if ($proposal === null) {
            throw new DisputeRuleViolation('There is no proposal on this case to commit');
        }
        if (!$committed->isCommitted()) {
            throw new DisputeRuleViolation('Committing requires a committed decision row, not another proposal');
        }
        if ($committed->caseId !== $this->id) {
            throw new DisputeRuleViolation('The decision names a different case');
        }
        if ($committed->sequence !== count($this->decisions) + 1) {
            throw new DisputeRuleViolation('A decision is appended after every row already on the case');
        }
        if (!$committed->commitsProposal($proposal)) {
            throw new DisputeRuleViolation(
                'The committed decision differs from the proposal in outcome, amount, evidence or escalation. '
                . 'A resolver cannot commit a decision nobody proposed.'
            );
        }
        if ($committed->evidenceHash !== $this->evidenceSetHash()) {
            throw new DisputeRuleViolation('The decision was reached against a different evidence set than the case holds');
        }
        if (!$committed->orderHolding->equals($this->ceiling) || !$committed->previouslyInstructed->equals($this->instructedRefund)) {
            throw new DisputeRuleViolation('The decision quotes a holding or prior instruction different from this case');
        }
        if ($committed->hasUnadjudicableClaim !== $this->hasUnadjudicableClaim()) {
            throw new DisputeRuleViolation('The decision disagrees with the case about whether it contains an unadjudicable claim');
        }

        $this->decisions[] = $committed;
        $this->instructedRefund = $this->instructedRefund->add($committed->refund);
        $this->residual = $this->ceiling->subtract($this->instructedRefund);
        $this->state = $this->state->next(DisputeState::EV_DECISION_COMMITTED);
        $this->awaiting = self::AWAITING_NOBODY;
        $this->openSlot = null;

        $this->appendEvent(
            DisputeEvent::KIND_DECISION_COMMITTED,
            self::ROLE_STAFF,
            $committed->actorId,
            sprintf(
                'Decision committed: %s. Refund %d cents. Appeal: %s',
                $committed->outcome->value,
                $committed->refund->cents,
                (string) $committed->appealNote,
            ),
            $now,
        );

        if ($committed->outcome->instructsMoney()) {
            $this->appendEvent(
                DisputeEvent::KIND_MONEY_INSTRUCTED,
                self::ROLE_STAFF,
                $committed->actorId,
                sprintf(
                    'Money instruction %s sent to Settlements for %d cents (contra: %s). Nothing has been booked by this module.',
                    (string) $committed->moneyInstructionId,
                    $committed->refund->cents,
                    $committed->outcome->commissionContra(),
                ),
                $now,
            );
        }
        if ($committed->outcome->requiresReturn()) {
            $this->appendEvent(
                DisputeEvent::KIND_RETURN_REQUESTED,
                self::ROLE_STAFF,
                $committed->actorId,
                'Return requested before the refund is released.',
                $now,
            );
        }
        if ($committed->outcome->resolvesToSeller()) {
            $this->appendEvent(
                DisputeEvent::KIND_ORDER_RELEASED_TO_SELLER,
                self::ROLE_STAFF,
                $committed->actorId,
                'Order released to the seller; no money moves from this decision.',
                $now,
            );
        }

        $this->version++;
    }

    public function reopen(string $actorId, string $reason, \DateTimeImmutable $now): void
    {
        if (trim($reason) === '') {
            throw new DisputeRuleViolation('A reopen states its reason. A case reopened on no stated ground is a second review nobody asked for');
        }
        $this->state = $this->state->next(DisputeState::EV_REOPENED);
        $this->openSlot = $this->orderId;
        $this->awaiting = self::AWAITING_STAFF;
        $this->appendEvent(
            DisputeEvent::KIND_REOPENED,
            self::ROLE_STAFF,
            $actorId,
            sprintf('Case reopened: %s. The prior decision stands as written and will be superseded, not edited.', $reason),
            $now,
        );
        $this->version++;
    }

    public function close(string $actorId, string $reason, \DateTimeImmutable $now): void
    {
        if (trim($reason) === '') {
            throw new DisputeRuleViolation('Closing a case states why; "closed" on its own is not a record');
        }
        $this->state = $this->state->next(DisputeState::EV_CASE_CLOSED);
        $this->openSlot = null;
        $this->awaiting = self::AWAITING_NOBODY;
        $this->appendEvent(
            DisputeEvent::KIND_CLOSED,
            self::ROLE_STAFF,
            $actorId,
            sprintf('Case closed: %s', $reason),
            $now,
        );
        $this->version++;
    }

    /**
     * The content hash of everything a decision reads from this case's file.
     * Sorted by media id so two readers of the same set compute the same value.
     */
    public function evidenceSetHash(): string
    {
        $rows = [];
        foreach ($this->evidence as $evidence) {
            $rows[] = [
                'media_id' => $evidence->mediaId,
                'owner_role' => $evidence->ownerRole,
                'mime' => $evidence->mime,
                'bytes' => $evidence->bytes,
                'sha256' => $evidence->sha256,
            ];
        }
        usort($rows, static fn (array $a, array $b): int => strcmp((string) $a['media_id'], (string) $b['media_id']));

        $material = [
            'case_id' => $this->id,
            'order_id' => $this->orderId,
            'claims' => array_map(static fn (Claim $c): string => $c->kind->value, $this->claims),
            'condition_fingerprint' => $this->conditionAtSale()->fingerprint(),
            'evidence' => $rows,
        ];

        return hash('sha256', json_encode($material, JSON_UNESCAPED_SLASHES) ?: '');
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'order_id' => $this->orderId,
            'listing_id' => $this->listingId,
            'buyer_id' => $this->buyerId,
            'seller_id' => $this->sellerId,
            'opened_by' => $this->openedBy,
            'opened_by_account_id' => $this->openedByAccountId,
            'lifecycle_state' => $this->state->value,
            'order_state_at_open' => $this->orderStateAtOpen,
            'claim_scope' => $this->claimScope->value,
            'severity' => $this->severity,
            'reason_code' => $this->reasonCode,
            'awaiting' => $this->awaiting,
            'open_slot' => $this->openSlot,
            'statement' => $this->statement,
            'ceiling_cents' => $this->ceiling->cents,
            'currency' => $this->currency,
            'instructed_refund_cents' => $this->instructedRefund->cents,
            'residual_cents' => $this->residual->cents,
            'escalation_code' => $this->escalationCode,
            'escalation_note' => $this->escalationNote,
            'version' => $this->version,
            'opened_at' => $this->openedAt->format(\DateTimeInterface::ATOM),
            'evidence_due_at' => $this->evidenceDueAt->format(\DateTimeInterface::ATOM),
            'sla_due_at' => $this->slaDueAt->format(\DateTimeInterface::ATOM),
            'idempotency_key' => $this->idempotencyKey,
        ];
    }

    private function appendEvent(
        string $kind,
        string $actorRole,
        string $actorId,
        string $body,
        \DateTimeImmutable $at,
        ?string $idempotencyKey = null,
    ): void {
        $this->events[] = new DisputeEvent(
            id: Id::generate('dev')->value(),
            kind: $kind,
            actorRole: $actorRole,
            actorId: $actorId,
            body: $body,
            sequence: count($this->events) + 1,
            occurredAt: $at,
            idempotencyKey: $idempotencyKey,
        );
    }

    private static function severityOf(ConditionRecord $record): string
    {
        $severity = Disclosure::SEVERITY_UNKNOWN;
        foreach ($record->disclosures as $disclosure) {
            if ($disclosure->severity === Disclosure::SEVERITY_FUNCTIONAL) {
                return Disclosure::SEVERITY_FUNCTIONAL;
            }
            if ($disclosure->severity === Disclosure::SEVERITY_COSMETIC) {
                $severity = Disclosure::SEVERITY_COSMETIC;
            }
        }

        return $severity;
    }
}
