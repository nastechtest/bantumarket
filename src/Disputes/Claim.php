<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * One assertion made on a case.
 *
 * A case carries a *set* of claims, unique per kind (`disputes.dispute_claims` has a
 * unique index on case_id + kind), because the decision rule reads the set: "is any claim
 * on this case one the platform cannot adjudicate". Storing a set rather than a single
 * `reason` string is also what stops the client from negotiating its way out of the rule —
 * a dispute about a watch that does not run and is also scratched has both claims, and the
 * scratch cannot be used to smuggle a refund for the movement.
 *
 * `adjudicable` is stored, not only derived: the row is the artefact a regulator or a
 * unhappy seller reads, and `CHECK (adjudicable_matches_the_kind)` binds it back to the
 * vocabulary so a hand-edited row cannot flip the flag without also having to change the
 * kind it names.
 */
final class Claim
{
    public const TABLE = 'dispute_claims';

    public function __construct(
        public readonly string $id,
        public readonly ClaimKind $kind,
        public readonly string $reasonCode,
        public readonly string $summary,
        public readonly \DateTimeImmutable $assertedAt,
    ) {
        if (trim($summary) === '') {
            throw new DisputeRuleViolation(
                "Claim {$kind->value} has no summary. A claim with no words is not evidence of an assertion, "
                . 'and the escalation rule would be firing on a string nobody wrote.'
            );
        }
    }

    public function isAdjudicable(): bool
    {
        return $this->kind->isAdjudicable();
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(string $caseId): array
    {
        return [
            'id' => $this->id,
            'case_id' => $caseId,
            'kind' => $this->kind->value,
            'reason_code' => $this->reasonCode,
            'adjudicable' => $this->isAdjudicable(),
            'summary' => $this->summary,
            'asserted_at' => $this->assertedAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            kind: ClaimKind::fromWire((string) $row['kind']),
            reasonCode: (string) $row['reason_code'],
            summary: (string) $row['summary'],
            assertedAt: new \DateTimeImmutable((string) $row['asserted_at']),
        );
    }
}
