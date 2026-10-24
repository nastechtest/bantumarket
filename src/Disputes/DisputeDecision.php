<?php

declare(strict_types=1);

namespace NasTech\Disputes;

use NasTech\SharedKernel\Money;

/**
 * One immutable decision record. A proposal and a committed decision are two
 * rows, and that is the point: committing never edits the proposal, and a
 * reopen never edits the decision. The case's read pointer moves forward; the
 * evidence does not.
 *
 * Every row names the actor and the capability it was taken under, carries the
 * reasoning, the hash of the evidence set it was reached against, and (on a
 * committed row) the appeal note the parties are given. The rule that a claim
 * the platform cannot adjudicate needs an escalation reason is enforced here,
 * before the DDL sees the row, because a resolver should be told the rule in a
 * sentence rather than as a check violation from inside commit().
 *
 * Money is integer cents and is never computed by this class beyond copying and
 * comparison: `authority` is the order's held amount less what an earlier
 * decision already instructed. No ledger row is written here or anywhere in
 * this module; the money effect is a DisputeMoneyInstruction published on the
 * outbox for Settlements to execute.
 */
final class DisputeDecision
{
    public const TABLE = 'dispute_decisions';

    public const STATE_PROPOSED = 'PROPOSED';
    public const STATE_COMMITTED = 'COMMITTED';

    /** @var list<string> */
    public const STATES = [self::STATE_PROPOSED, self::STATE_COMMITTED];

    private readonly Money $authority;

    public function __construct(
        public readonly string $id,
        public readonly string $caseId,
        public readonly int $sequence,
        public readonly string $decisionState,
        public readonly DecisionOutcome $outcome,
        public readonly Money $refund,
        public readonly Money $orderHolding,
        public readonly Money $previouslyInstructed,
        public readonly string $actorId,
        public readonly string $actorCapability,
        public readonly string $reasoning,
        public readonly string $evidenceHash,
        public readonly bool $hasUnadjudicableClaim,
        public readonly ?string $escalationCode,
        public readonly ?string $escalationNote,
        public readonly ?string $appealNote,
        public readonly ?string $moneyInstructionId,
        public readonly ?string $proposalDecisionId,
        public readonly ?string $supersedesDecisionId,
        public readonly \DateTimeImmutable $decidedAt,
        public readonly ?string $idempotencyKey = null,
    ) {
        if ($id === '' || $caseId === '') {
            throw new DisputeRuleViolation('A decision names its case and itself');
        }
        if ($sequence < 1) {
            throw new DisputeRuleViolation('A decision has a positive sequence within its case');
        }
        if (!in_array($decisionState, self::STATES, true)) {
            throw new DisputeRuleViolation("Unknown decision state \"{$decisionState}\"");
        }
        if (trim($actorId) === '') {
            throw new DisputeRuleViolation('A decision names the actor who made it; an anonymous decision is not reviewable');
        }
        if (!in_array($actorCapability, [DisputeCapability::DECIDE, DisputeCapability::DECIDE_WITH_ESCALATION], true)) {
            throw new DisputeRuleViolation(sprintf(
                'A decision records the capability it was taken under (%s or %s), not "%s"',
                DisputeCapability::DECIDE,
                DisputeCapability::DECIDE_WITH_ESCALATION,
                $actorCapability,
            ));
        }
        if (trim($reasoning) === '') {
            throw new DisputeRuleViolation(
                'A decision has no written reasoning. A decision that cannot say why is an outcome nobody can appeal'
            );
        }
        if (preg_match('/^[0-9a-f]{64}$/', $evidenceHash) !== 1) {
            throw new DisputeRuleViolation('The evidence set hash is a sha-256 hex digest, so a reviewer can prove what was read');
        }
        if ($this->orderHolding->isNegative() || $this->previouslyInstructed->isNegative()) {
            throw new DisputeRuleViolation('A decision cannot be taken against a negative holding or a negative prior instruction');
        }
        if (!$this->orderHolding->equals($this->previouslyInstructed) && $this->previouslyInstructed->gt($this->orderHolding)) {
            throw new DisputeRuleViolation('Prior instructions exceed what the order holds; the case ceiling would be negative');
        }

        $this->authority = $this->orderHolding->subtract($this->previouslyInstructed);

        if (!$this->refund->equals(Money::zero($this->authority->currency)) && $this->refund->currency !== $this->authority->currency) {
            throw new DisputeRuleViolation('A refund and the order holding must be in the same currency');
        }
        if ($this->refund->isNegative()) {
            throw new DisputeRuleViolation('A refund cannot be negative');
        }
        if ($this->refund->gt($this->authority)) {
            throw new DisputeRuleViolation(sprintf(
                'Refund of %d cents exceeds the %d cents this case may still instruct',
                $this->refund->cents,
                $this->authority->cents,
            ));
        }

        match ($outcome) {
            DecisionOutcome::FULL_REFUND, DecisionOutcome::RETURN_AND_REFUND => $this->assertRefundEqualsAuthority(),
            DecisionOutcome::PARTIAL_REFUND => $this->assertPartialLeavesResidual(),
            DecisionOutcome::NO_ACTION, DecisionOutcome::EXTERNAL_ROUTE_ONLY => $this->assertMovesNothing(),
        };

        $escalated = $escalationCode !== null || $escalationNote !== null;
        if ($escalated) {
            if ($escalationCode === null || trim($escalationCode) === '') {
                throw new DisputeRuleViolation('An escalation names its code as well as its note');
            }
            if ($escalationNote === null || trim($escalationNote) === '') {
                throw new DisputeRuleViolation('An escalation has a written reason; a code on its own says nothing');
            }
            if ($actorCapability !== DisputeCapability::DECIDE_WITH_ESCALATION) {
                throw new DisputeRuleViolation(sprintf(
                    'A decision that depends on an escalation requires the "%s" capability, not "%s"',
                    DisputeCapability::DECIDE_WITH_ESCALATION,
                    $actorCapability,
                ));
            }
        }

        if ($hasUnadjudicableClaim) {
            if ($outcome === DecisionOutcome::NO_ACTION) {
                throw new DisputeRuleViolation(
                    'A claim the platform cannot adjudicate cannot be closed with NO_ACTION. The honest outcome is '
                    . 'EXTERNAL_ROUTE_ONLY, which says the question is not ours rather than that it was answered.'
                );
            }
            if (!$escalated) {
                throw new DisputeRuleViolation(
                    'This case contains a claim the platform cannot adjudicate (mechanical function, water '
                    . 'resistance or authenticity). A decision against it requires an escalation code and a '
                    . 'written escalation reason; the platform does not invent a finding it cannot reach.'
                );
            }
        }

        if ($decisionState === self::STATE_COMMITTED) {
            if ($appealNote === null || trim($appealNote) === '') {
                throw new DisputeRuleViolation('A committed decision carries the appeal note the parties are given');
            }
            if ($outcome->instructsMoney()) {
                if ($moneyInstructionId === null || trim($moneyInstructionId) === '') {
                    throw new DisputeRuleViolation(
                        'A committed decision that moves money must name the instruction sent to Settlements'
                    );
                }
            } elseif ($moneyInstructionId !== null) {
                throw new DisputeRuleViolation('A decision that moves no money cannot carry a money instruction');
            }
            if ($proposalDecisionId === null || trim($proposalDecisionId) === '') {
                throw new DisputeRuleViolation('A committed decision names the proposal it commits; otherwise "what was proposed" is unknowable');
            }
        } else {
            if ($moneyInstructionId !== null) {
                throw new DisputeRuleViolation('A proposal has not moved money and cannot carry an instruction');
            }
            if ($proposalDecisionId !== null) {
                throw new DisputeRuleViolation('A proposal cannot name itself as its own committed decision');
            }
        }

        if ($supersedesDecisionId !== null && $supersedesDecisionId === $id) {
            throw new DisputeRuleViolation('A decision cannot supersede itself');
        }
    }

    public function authority(): Money
    {
        return $this->authority;
    }

    public function isProposal(): bool
    {
        return $this->decisionState === self::STATE_PROPOSED;
    }

    public function isCommitted(): bool
    {
        return $this->decisionState === self::STATE_COMMITTED;
    }

    /**
     * The vocabulary Reporting's dispute projector binds to. Kept here so the
     * mapping has one owner and the projector cannot receive an outcome it does
     * not know.
     */
    public function reportingOutcome(): string
    {
        return match ($this->outcome) {
            DecisionOutcome::FULL_REFUND, DecisionOutcome::RETURN_AND_REFUND => 'BUYER_FAVOUR',
            DecisionOutcome::PARTIAL_REFUND => 'SPLIT',
            DecisionOutcome::NO_ACTION, DecisionOutcome::EXTERNAL_ROUTE_ONLY => 'SELLER_FAVOUR',
        };
    }

    /**
     * Whether this committed row is consistent with the proposal it commits.
     * The case checks this before appending, so the final decision cannot be
     * silently different from the one the resolver proposed.
     */
    public function commitsProposal(self $proposal): bool
    {
        return $proposal->isProposal()
            && $this->proposalDecisionId === $proposal->id
            && $this->outcome === $proposal->outcome
            && $this->refund->equals($proposal->refund)
            && $this->evidenceHash === $proposal->evidenceHash
            && $this->hasUnadjudicableClaim === $proposal->hasUnadjudicableClaim
            && $this->escalationCode === $proposal->escalationCode
            && $this->escalationNote === $proposal->escalationNote;
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'case_id' => $this->caseId,
            'sequence' => $this->sequence,
            'decision_state' => $this->decisionState,
            'outcome' => $this->outcome->value,
            'refund_cents' => $this->refund->cents,
            'currency' => $this->refund->currency,
            'order_holding_cents' => $this->orderHolding->cents,
            'previously_instructed_cents' => $this->previouslyInstructed->cents,
            'authority_cents' => $this->authority->cents,
            'commission_contra' => $this->outcome->commissionContra(),
            'actor_id' => $this->actorId,
            'actor_capability' => $this->actorCapability,
            'reasoning' => $this->reasoning,
            'evidence_hash' => $this->evidenceHash,
            'has_unadjudicable_claim' => $this->hasUnadjudicableClaim,
            'escalation_code' => $this->escalationCode,
            'escalation_note' => $this->escalationNote,
            'appeal_note' => $this->appealNote,
            'money_instruction_id' => $this->moneyInstructionId,
            'proposal_decision_id' => $this->proposalDecisionId,
            'supersedes_decision_id' => $this->supersedesDecisionId,
            'decided_at' => $this->decidedAt->format(\DateTimeInterface::ATOM),
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
            caseId: (string) $row['case_id'],
            sequence: (int) $row['sequence'],
            decisionState: (string) $row['decision_state'],
            outcome: DecisionOutcome::fromWire((string) $row['outcome']),
            refund: Money::fromCents((int) $row['refund_cents'], (string) $row['currency']),
            orderHolding: Money::fromCents((int) $row['order_holding_cents'], (string) $row['currency']),
            previouslyInstructed: Money::fromCents((int) $row['previously_instructed_cents'], (string) $row['currency']),
            actorId: (string) $row['actor_id'],
            actorCapability: (string) $row['actor_capability'],
            reasoning: (string) $row['reasoning'],
            evidenceHash: (string) $row['evidence_hash'],
            hasUnadjudicableClaim: (bool) $row['has_unadjudicable_claim'],
            escalationCode: $row['escalation_code'] === null ? null : (string) $row['escalation_code'],
            escalationNote: $row['escalation_note'] === null ? null : (string) $row['escalation_note'],
            appealNote: $row['appeal_note'] === null ? null : (string) $row['appeal_note'],
            moneyInstructionId: $row['money_instruction_id'] === null ? null : (string) $row['money_instruction_id'],
            proposalDecisionId: $row['proposal_decision_id'] === null ? null : (string) $row['proposal_decision_id'],
            supersedesDecisionId: $row['supersedes_decision_id'] === null ? null : (string) $row['supersedes_decision_id'],
            decidedAt: new \DateTimeImmutable((string) $row['decided_at']),
            idempotencyKey: $row['idempotency_key'] === null ? null : (string) $row['idempotency_key'],
        );
    }

    private function assertRefundEqualsAuthority(): void
    {
        if (!$this->refund->equals($this->authority) || !$this->refund->isPositive()) {
            throw new DisputeRuleViolation(sprintf(
                'A full refund is the whole remaining authority (%d cents); got %d cents',
                $this->authority->cents,
                $this->refund->cents,
            ));
        }
    }

    private function assertPartialLeavesResidual(): void
    {
        if (!$this->refund->isPositive() || !$this->refund->lt($this->authority)) {
            throw new DisputeRuleViolation(sprintf(
                'A partial refund is greater than zero and less than the remaining authority (%d cents); got %d cents',
                $this->authority->cents,
                $this->refund->cents,
            ));
        }
    }

    private function assertMovesNothing(): void
    {
        if (!$this->refund->isZero()) {
            throw new DisputeRuleViolation(
                "Outcome {$this->outcome->value} moves no money; a refund amount on it is a contradiction"
            );
        }
    }
}
