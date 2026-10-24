<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * The capability names a dispute action requires, as strings because they are the
 * platform's vocabulary rather than this module's invention: `Identity` issues them, and
 * `NasTech\Disputes\ActorAuthority` answers whether a given actor holds one.
 *
 * Why capability names and not role names: "staff" is a description of a person, and a
 * person who can read a case is not automatically a person who can decide who loses money.
 * `DECIDE` and `DECIDE_WITH_ESCALATION` are split precisely so that the epistemics rule can
 * be enforced by permission as well as by domain logic — a resolver who has never been
 * trained to hand a matter to a watchmaker cannot commit a decision that depends on having
 * done so.
 *
 * A decision row stores `actor_capability` (NOT NULL) so the record says which permission
 * was used, not merely who pressed the button. That is the difference between an audit trail
 * and a name.
 */
final class DisputeCapability
{
    public const READ = 'disputes:read';
    public const OPEN = 'disputes:open';
    public const ADD_EVIDENCE = 'disputes:evidence:add';
    public const TRIAGE = 'disputes:triage';
    public const DECIDE = 'disputes:decide';
    public const DECIDE_WITH_ESCALATION = 'disputes:decide:escalated';
    public const ESCALATE = 'disputes:escalate';
    public const REOPEN = 'disputes:reopen';
    public const CLOSE = 'disputes:close';

    /** @var list<string> */
    public const ALL = [
        self::READ,
        self::OPEN,
        self::ADD_EVIDENCE,
        self::TRIAGE,
        self::DECIDE,
        self::DECIDE_WITH_ESCALATION,
        self::ESCALATE,
        self::REOPEN,
        self::CLOSE,
    ];

    private function __construct()
    {
    }

    public static function assertKnown(string $capability): void
    {
        if (!in_array($capability, self::ALL, true)) {
            throw new DisputeRuleViolation(sprintf(
                'Unknown capability "%s". Disputes asks for one of: %s',
                $capability,
                implode(', ', self::ALL),
            ));
        }
    }
}
