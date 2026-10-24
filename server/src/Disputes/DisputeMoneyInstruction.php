<?php

declare(strict_types=1);

namespace NasTech\Disputes;

use NasTech\SharedKernel\Money;

/**
 * The command Disputes sends to Settlements when a decision moves money.
 *
 * It is a value, not a ledger write: this module has no Settlements edge, holds
 * no ledger repository, and never writes a `settlements.ledger_entries` row.
 * The instruction states the entitlement — amount, currency, the commission
 * contra the outcome implies — and Settlements derives and books the arithmetic
 * in its own transaction. `commission_contra` is a request, not a number,
 * because a rate is not Disputes' to know.
 *
 * `evidence_hash` travels with the instruction so the money path can be shown
 * exactly what was read when the decision was made, even years later.
 */
final class DisputeMoneyInstruction
{
    public const KIND_FULL = 'FULL';
    public const KIND_PARTIAL = 'PARTIAL';
    public const KIND_RETURN = 'RETURN';

    public function __construct(
        public readonly string $id,
        public readonly string $caseId,
        public readonly string $orderId,
        public readonly string $decisionId,
        public readonly Money $amount,
        public readonly Money $orderHolding,
        public readonly Money $previouslyInstructed,
        public readonly string $commissionContra,
        public readonly string $evidenceHash,
        public readonly \DateTimeImmutable $instructedAt,
    ) {
        if (trim($id) === '' || trim($caseId) === '' || trim($orderId) === '' || trim($decisionId) === '') {
            throw new DisputeRuleViolation('A money instruction names itself, its case, its order and its decision');
        }
        if (!$this->amount->isPositive()) {
            throw new DisputeRuleViolation('A money instruction that moves nothing is not an instruction; use NO_ACTION');
        }
        if ($this->amount->gt($orderHolding->subtract($previouslyInstructed))) {
            throw new DisputeRuleViolation('A money instruction cannot exceed what remains of the order holding');
        }
        if (!in_array($commissionContra, ['REVERSE_FULL', 'REVERSE_PROPORTIONAL', 'NONE'], true)) {
            throw new DisputeRuleViolation("Unknown commission contra \"{$commissionContra}\"");
        }
    }

    public static function for(DisputeDecision $decision, string $instructionId, string $orderId, \DateTimeImmutable $at): self
    {
        if (!$decision->isCommitted() || !$decision->outcome->instructsMoney() || $decision->moneyInstructionId === null) {
            throw new DisputeRuleViolation('Only a committed money-bearing decision produces a money instruction');
        }

        return new self(
            id: $instructionId,
            caseId: $decision->caseId,
            orderId: $orderId,
            decisionId: $decision->id,
            amount: $decision->refund,
            orderHolding: $decision->orderHolding,
            previouslyInstructed: $decision->previouslyInstructed,
            commissionContra: $decision->outcome->commissionContra(),
            evidenceHash: $decision->evidenceHash,
            instructedAt: $at,
        );
    }

    public function kind(): string
    {
        return match (true) {
            $this->commissionContra === 'REVERSE_PROPORTIONAL' => self::KIND_PARTIAL,
            $this->commissionContra === 'REVERSE_FULL' && $this->amount->equals($this->orderHolding->subtract($this->previouslyInstructed)) => self::KIND_FULL,
            default => self::KIND_FULL,
        };
    }

    /**
     * The outbox payload Settlements consumes. Nulls are absent keys, not null
     * values, so a consumer cannot read "no contra" as a zero reversal.
     *
     * @return array<string,mixed>
     */
    public function toPayload(): array
    {
        return [
            'instruction_id' => $this->id,
            'case_id' => $this->caseId,
            'order_id' => $this->orderId,
            'decision_id' => $this->decisionId,
            'amount_cents' => $this->amount->cents,
            'currency' => $this->amount->currency,
            'order_holding_cents' => $this->orderHolding->cents,
            'previously_instructed_cents' => $this->previouslyInstructed->cents,
            'commission_contra' => $this->commissionContra,
            'evidence_hash' => $this->evidenceHash,
            'instructed_at' => $this->instructedAt->format(\DateTimeInterface::ATOM),
        ];
    }
}
