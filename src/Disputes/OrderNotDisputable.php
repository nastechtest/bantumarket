<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * The order does not admit a dispute, or the window on it has closed.
 *
 * A specialisation of `DisputeRuleViolation` rather than a sibling because every caller
 * that only needs "this was refused" can keep catching the general class, while the HTTP
 * edge catches this one to answer with the two things brief 16 requires a refusal to carry:
 * the rule that applied, and the date that caused it. "You are too late" without a date
 * reads as a whim; "your window closed on 12 June" reads as a rule.
 */
final class OrderNotDisputable extends DisputeRuleViolation
{
    public function __construct(
        string $message,
        public readonly string $reasonCode,
        public readonly ?\DateTimeImmutable $governingDate = null,
    ) {
        parent::__construct($message);
    }
}
