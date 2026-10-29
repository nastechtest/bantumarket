<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * The append-only evidence of a sanction decision: who, when, why.
 *
 * A proposal and an approval are two rows, never one row edited. A warning is
 * one WARNING_ISSUED row because it has one actor. The rows are what a review
 * reads after the sanction's state has moved on, and the migration grants the
 * application role INSERT and SELECT only — there is no correction path that
 * needs an UPDATE or a DELETE.
 */
final class SanctionDecision
{
    public const PROPOSED = 'PROPOSED';
    public const APPROVED = 'APPROVED';
    public const WARNING_ISSUED = 'WARNING_ISSUED';

    public const ROLE_MAKER = 'MAKER';
    public const ROLE_CHECKER = 'CHECKER';

    /** @var list<string> */
    public const DECISIONS = [self::PROPOSED, self::APPROVED, self::WARNING_ISSUED];

    /** @var list<string> */
    public const ROLES = [self::ROLE_MAKER, self::ROLE_CHECKER];

    public function __construct(
        public readonly string $id,
        public readonly string $sanctionId,
        public readonly string $decision,
        public readonly string $actorId,
        public readonly string $actorRole,
        public readonly string $reason,
        public readonly \DateTimeImmutable $decidedAt,
    ) {
        if ($id === '' || $sanctionId === '' || $actorId === '') {
            throw new SafetyRuleViolation('A sanction decision names itself, its sanction and its actor');
        }
        if (!in_array($decision, self::DECISIONS, true)) {
            throw new SafetyRuleViolation(sprintf('Unknown sanction decision "%s"', $decision));
        }
        if (!in_array($actorRole, self::ROLES, true)) {
            throw new SafetyRuleViolation(sprintf('Unknown decision actor role "%s"', $actorRole));
        }
        if (trim($reason) === '') {
            throw new SafetyRuleViolation('A sanction decision records its reason; "because" is not evidence');
        }
        $expectedRole = $decision === self::APPROVED ? self::ROLE_CHECKER : self::ROLE_MAKER;
        if ($actorRole !== $expectedRole) {
            throw new SafetyRuleViolation(sprintf(
                'A %s decision is made by the %s, not the %s',
                $decision,
                strtolower($expectedRole),
                strtolower($actorRole),
            ));
        }
    }

    public static function proposed(
        string $id,
        string $sanctionId,
        string $actorId,
        string $reason,
        \DateTimeImmutable $at,
    ): self {
        return new self($id, $sanctionId, self::PROPOSED, $actorId, self::ROLE_MAKER, $reason, $at);
    }

    public static function approved(
        string $id,
        string $sanctionId,
        string $actorId,
        string $reason,
        \DateTimeImmutable $at,
    ): self {
        return new self($id, $sanctionId, self::APPROVED, $actorId, self::ROLE_CHECKER, $reason, $at);
    }

    public static function warningIssued(
        string $id,
        string $sanctionId,
        string $actorId,
        string $reason,
        \DateTimeImmutable $at,
    ): self {
        return new self($id, $sanctionId, self::WARNING_ISSUED, $actorId, self::ROLE_MAKER, $reason, $at);
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            sanctionId: (string) $row['sanction_id'],
            decision: (string) $row['decision'],
            actorId: (string) $row['actor_id'],
            actorRole: (string) $row['actor_role'],
            reason: (string) $row['reason'],
            decidedAt: new \DateTimeImmutable((string) $row['decided_at']),
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'sanction_id' => $this->sanctionId,
            'decision' => $this->decision,
            'actor_id' => $this->actorId,
            'actor_role' => $this->actorRole,
            'reason' => $this->reason,
            'decided_at' => $this->decidedAt->format(\DateTimeInterface::ATOM),
        ];
    }
}
