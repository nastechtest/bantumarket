<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * One account action.
 *
 * A warning is complete when it is issued: one actor, one reason, one expiry,
 * one evidence row. A suspend or a ban starts PROPOSED and becomes APPLIED only
 * when a second staff account approves it. The constructor enforces the shape
 * for both states, so a hand-built row cannot skip the check the command makes.
 *
 * `expires_at` is required for all three. A sanction with no end is a decision
 * nobody can review, and the difference between "until Friday" and "forever"
 * is exactly the difference a ban review turns on.
 */
final class Sanction
{
    public function __construct(
        public readonly string $id,
        public readonly string $targetAccountId,
        public readonly string $action,
        public readonly string $reason,
        public readonly string $makerId,
        public readonly \DateTimeImmutable $expiresAt,
        public readonly \DateTimeImmutable $createdAt,
        public readonly string $state,
        public readonly ?string $checkerId,
        public readonly ?\DateTimeImmutable $decidedAt,
        public readonly int $version,
    ) {
        if ($id === '' || $targetAccountId === '' || $makerId === '') {
            throw new SafetyRuleViolation('A sanction names itself, its target and the account that raised it');
        }
        if (!SanctionAction::isValid($action)) {
            throw new SafetyRuleViolation(sprintf('Unknown sanction action "%s"', $action));
        }
        if (!SanctionState::isValid($state)) {
            throw new SafetyRuleViolation(sprintf('Unknown sanction state "%s"', $state));
        }
        if (trim($reason) === '') {
            throw new SafetyRuleViolation('A sanction names its reason; an unexplained restraint cannot be appealed');
        }
        if ($expiresAt <= $createdAt) {
            throw new SafetyRuleViolation('A sanction expires after it was raised');
        }
        if ($version < 1) {
            throw new SafetyRuleViolation('A sanction starts at version 1');
        }

        if ($state === SanctionState::PROPOSED) {
            if (!SanctionAction::requiresSecondActor($action)) {
                throw new SafetyRuleViolation('A warning is complete when issued; it is never left proposed');
            }
            if ($checkerId !== null || $decidedAt !== null) {
                throw new SafetyRuleViolation('A proposed sanction has no checker and no decision time');
            }
        } else {
            if ($decidedAt === null) {
                throw new SafetyRuleViolation('An applied sanction says when it was applied');
            }
            if (SanctionAction::requiresSecondActor($action)) {
                if ($checkerId === null) {
                    throw new SafetyRuleViolation('A suspend or ban is applied by a second actor, and that actor is named');
                }
                if ($checkerId === $makerId) {
                    throw new SafetyRuleViolation(
                        'Maker and checker must be different accounts; a restraint one person can apply alone is not checked'
                    );
                }
            } elseif ($checkerId !== null) {
                throw new SafetyRuleViolation('A warning is single-actor and carries no checker');
            }
        }
    }

    public static function request(
        string $id,
        string $targetAccountId,
        string $action,
        string $reason,
        string $makerId,
        \DateTimeImmutable $expiresAt,
        \DateTimeImmutable $at,
    ): self {
        $singleActor = $action === SanctionAction::WARNING;

        return new self(
            id: $id,
            targetAccountId: $targetAccountId,
            action: $action,
            reason: trim($reason),
            makerId: $makerId,
            expiresAt: $expiresAt,
            createdAt: $at,
            state: $singleActor ? SanctionState::APPLIED : SanctionState::PROPOSED,
            checkerId: null,
            decidedAt: $singleActor ? $at : null,
            version: 1,
        );
    }

    public function requiresSecondActor(): bool
    {
        return SanctionAction::requiresSecondActor($this->action);
    }

    public function isProposed(): bool
    {
        return $this->state === SanctionState::PROPOSED;
    }

    public function isBan(): bool
    {
        return $this->action === SanctionAction::BAN;
    }

    /**
     * The second actor's decision. Returns a new row; the proposal is never
     * edited into an approval, and the evidence table keeps both.
     */
    public function approve(string $checkerId, \DateTimeImmutable $at): self
    {
        if (!$this->requiresSecondActor()) {
            throw new SafetyRuleViolation('A warning is applied by its issuer; there is nothing to approve');
        }
        if (!$this->isProposed()) {
            throw new SafetyRuleViolation(sprintf('Sanction %s is already %s', $this->id, $this->state));
        }
        if (trim($checkerId) === '') {
            throw new SafetyRuleViolation('An approval names the second actor');
        }
        if ($checkerId === $this->makerId) {
            throw new SafetyRuleViolation(
                'Maker and checker must be different accounts; the account that raised the sanction cannot apply it'
            );
        }
        if ($at >= $this->expiresAt) {
            throw new SafetyRuleViolation('A sanction that has already expired cannot be applied');
        }

        return new self(
            id: $this->id,
            targetAccountId: $this->targetAccountId,
            action: $this->action,
            reason: $this->reason,
            makerId: $this->makerId,
            expiresAt: $this->expiresAt,
            createdAt: $this->createdAt,
            state: SanctionState::APPLIED,
            checkerId: $checkerId,
            decidedAt: $at,
            version: $this->version + 1,
        );
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            targetAccountId: (string) $row['target_account_id'],
            action: (string) $row['action'],
            reason: (string) $row['reason'],
            makerId: (string) $row['maker_id'],
            expiresAt: new \DateTimeImmutable((string) $row['expires_at']),
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
            state: (string) $row['state'],
            checkerId: $row['checker_id'] === null ? null : (string) $row['checker_id'],
            decidedAt: $row['decided_at'] === null ? null : new \DateTimeImmutable((string) $row['decided_at']),
            version: (int) $row['version'],
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'target_account_id' => $this->targetAccountId,
            'action' => $this->action,
            'reason' => $this->reason,
            'maker_id' => $this->makerId,
            'expires_at' => $this->expiresAt->format(\DateTimeInterface::ATOM),
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
            'state' => $this->state,
            'checker_id' => $this->checkerId,
            'decided_at' => $this->decidedAt?->format(\DateTimeInterface::ATOM),
            'version' => $this->version,
        ];
    }
}
