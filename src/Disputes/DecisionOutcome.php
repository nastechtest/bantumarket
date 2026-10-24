<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * What a decision does, as one of five values.
 *
 * There is no `WIN` and no `LOSS`: an outcome names an effect on money and on the item,
 * because a dispute that "went well" is not something the ledger can act on.
 *
 * The two refund outcomes carry an amount; `NO_ACTION` and `EXTERNAL_ROUTE_ONLY` carry
 * none. `EXTERNAL_ROUTE_ONLY` is the outcome the epistemics force: the claim is one the
 * platform cannot settle, so the case records that and hands over the external route
 * instead of inventing a finding. It is deliberately not called `DENIED` — nobody is
 * being refused, the platform is saying this is not its to decide.
 *
 * Amount arithmetic is checked three ways: here (which outcome may carry what), in
 * `DisputeCase::assertWithinMoneyAuthority()` (against what the order holds), and in the
 * DDL as five named row rules on `disputes.dispute_decisions`, so a row written by
 * something that never ran this PHP still cannot claim a partial refund of the whole hold.
 */
enum DecisionOutcome: string
{
    case FULL_REFUND = 'FULL_REFUND';
    case PARTIAL_REFUND = 'PARTIAL_REFUND';
    case RETURN_AND_REFUND = 'RETURN_AND_REFUND';
    case NO_ACTION = 'NO_ACTION';
    case EXTERNAL_ROUTE_ONLY = 'EXTERNAL_ROUTE_ONLY';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }

    /** The outcomes that instruct the money path to move something to the buyer. */
    public function instructsMoney(): bool
    {
        return in_array($this, [self::FULL_REFUND, self::PARTIAL_REFUND, self::RETURN_AND_REFUND], true);
    }

    /** Outcomes that end the case in the seller's favour and release the order. */
    public function resolvesToSeller(): bool
    {
        return in_array($this, [self::NO_ACTION, self::EXTERNAL_ROUTE_ONLY], true);
    }

    /** Whether the buyer is expected to give the item back. */
    public function requiresReturn(): bool
    {
        return $this === self::RETURN_AND_REFUND;
    }

    public static function fromWire(string $value): self
    {
        $case = self::tryFrom($value);
        if ($case === null) {
            throw new DisputeRuleViolation(sprintf(
                'Unknown decision outcome "%s". Admissible: %s',
                $value,
                implode(', ', self::values()),
            ));
        }

        return $case;
    }

    /**
     * The commission consequence the decision asks the money path to produce. Disputes
     * does not compute it — there is no Commissions edge, and a rate is not this module's
     * to know — so the instruction states the *entitlement* and `Settlements` derives the
     * arithmetic. `NONE` says so explicitly rather than leaving the field blank, which is
     * how a no-action decision gets read as "the commission was left charged".
     */
    public function commissionContra(): string
    {
        return match ($this) {
            self::FULL_REFUND, self::RETURN_AND_REFUND => 'REVERSE_FULL',
            self::PARTIAL_REFUND => 'REVERSE_PROPORTIONAL',
            self::NO_ACTION, self::EXTERNAL_ROUTE_ONLY => 'NONE',
        };
    }
}
