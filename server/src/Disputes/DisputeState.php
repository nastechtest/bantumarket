<?php

declare(strict_types=1);

namespace NasTech\Disputes;

use NasTech\SharedKernel\IllegalTransition;
use NasTech\SharedKernel\StateMachine;

/**
 * The case's own ladder, distinct from the order's.
 *
 * Brief 46 names the states: opened, evidence_window, under_review,
 * decision_proposed, decided, closed, plus escalated and reopened. Two of them
 * are deliberately not transient:
 *
 *   ESCALATED  — the case leaves the ordinary queue, and the resolver's note is
 *                what says why. A case that can be escalated without a written
 *                reason is a queue move nobody can audit.
 *   REOPENED   — a decided case put back in front of a resolver. The prior
 *                decision row is never edited; the reopened case produces a new
 *                one (see DisputeDecision).
 *
 * The machine is deny-by-default: every transition is named here, and anything
 * else raises IllegalTransition rather than being silently ignored.
 */
enum DisputeState: string
{
    case OPENED = 'OPENED';
    case EVIDENCE_WINDOW = 'EVIDENCE_WINDOW';
    case UNDER_REVIEW = 'UNDER_REVIEW';
    case DECISION_PROPOSED = 'DECISION_PROPOSED';
    case ESCALATED = 'ESCALATED';
    case DECIDED = 'DECIDED';
    case REOPENED = 'REOPENED';
    case CLOSED = 'CLOSED';

    public const EV_OPEN_EVIDENCE_WINDOW = 'OPEN_EVIDENCE_WINDOW';
    public const EV_REVIEW_STARTED = 'REVIEW_STARTED';
    public const EV_DECISION_PROPOSED = 'DECISION_PROPOSED';
    public const EV_DECISION_COMMITTED = 'DECISION_COMMITTED';
    public const EV_ESCALATED = 'ESCALATED';
    public const EV_REOPENED = 'REOPENED';
    public const EV_CASE_CLOSED = 'CASE_CLOSED';

    /**
     * from => [event => to].
     *
     * @var array<string, array<string, string>>
     */
    public const TRANSITIONS = [
        self::OPENED => [
            self::EV_OPEN_EVIDENCE_WINDOW => self::EVIDENCE_WINDOW,
            self::EV_ESCALATED => self::ESCALATED,
        ],
        self::EVIDENCE_WINDOW => [
            self::EV_REVIEW_STARTED => self::UNDER_REVIEW,
            self::EV_ESCALATED => self::ESCALATED,
        ],
        self::UNDER_REVIEW => [
            self::EV_DECISION_PROPOSED => self::DECISION_PROPOSED,
            self::EV_ESCALATED => self::ESCALATED,
        ],
        self::DECISION_PROPOSED => [
            self::EV_DECISION_COMMITTED => self::DECIDED,
        ],
        self::ESCALATED => [
            self::EV_REVIEW_STARTED => self::UNDER_REVIEW,
            self::EV_DECISION_PROPOSED => self::DECISION_PROPOSED,
        ],
        self::DECIDED => [
            self::EV_REOPENED => self::REOPENED,
            self::EV_CASE_CLOSED => self::CLOSED,
        ],
        self::REOPENED => [
            self::EV_REVIEW_STARTED => self::UNDER_REVIEW,
            self::EV_ESCALATED => self::ESCALATED,
        ],
        self::CLOSED => [
            self::EV_REOPENED => self::REOPENED,
        ],
    ];

    /**
     * States in which the case still holds the order's live slot and accepts
     * evidence. DECIDED is deliberately absent: once a decision is committed,
     * new evidence would be evidence the decision was not made against.
     *
     * @var list<self>
     */
    public const LIVE = [
        self::OPENED,
        self::EVIDENCE_WINDOW,
        self::UNDER_REVIEW,
        self::DECISION_PROPOSED,
        self::ESCALATED,
        self::REOPENED,
    ];

    /** @var list<self> states a fresh evidence attachment is accepted in */
    public const EVIDENCE_OPEN = [
        self::OPENED,
        self::EVIDENCE_WINDOW,
        self::UNDER_REVIEW,
        self::ESCALATED,
        self::REOPENED,
    ];

    public static function machine(): StateMachine
    {
        return new StateMachine('DisputeCase', self::TRANSITIONS);
    }

    public function isLive(): bool
    {
        return in_array($this, self::LIVE, true);
    }

    public function acceptsEvidence(): bool
    {
        return in_array($this, self::EVIDENCE_OPEN, true);
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $state): string => $state->value, self::cases());
    }

    /**
     * @return list<string> the values that keep the order's live case slot
     */
    public static function liveValues(): array
    {
        return array_map(static fn (self $state): string => $state->value, self::LIVE);
    }

    public function next(string $event): self
    {
        $target = self::TRANSITIONS[$this->value][$event] ?? null;
        if ($target === null) {
            throw new IllegalTransition(sprintf(
                'DisputeCase: "%s" is not a legal event from "%s". Allowed: %s',
                $event,
                $this->value,
                implode(', ', array_keys(self::TRANSITIONS[$this->value] ?? [])) ?: '(none — terminal)',
            ));
        }

        return self::from($target);
    }
}
