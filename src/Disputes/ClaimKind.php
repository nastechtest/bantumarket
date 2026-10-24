<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * What a buyer or seller is actually asserting, in the platform's own vocabulary.
 *
 * The list is the buyer UI's `ClaimKind` (apps/web-public/src/features/dispute/claim-scope.ts)
 * and the staff console binds to the same strings. Three of the seven cannot be settled by
 * comparing the listing's records against the parties' records, and this file is the only
 * place that says so — the UIs render the consequence, the domain holds the rule:
 *
 *   mechanical_function  — whether it runs, and how it keeps time
 *   water_resistance     — whether it keeps water out
 *   authenticity         — whether it is what the listing says it is
 *
 * A movement needs a watchmaker, a pressure rating needs a bench, provenance needs the case
 * opened. NasTech has none of those, so `isAdjudicable()` is false for exactly those three
 * and `DisputeCase::hasUnadjudicableClaim()` is what `DecideDispute` refuses a plain refund
 * against. Storing the flag as data (`dispute_claims.adjudicable`) and binding it to the kind
 * with a named DDL `CHECK` means the epistemic boundary survives whoever next writes a
 * handler: a row that calls `authenticity` adjudicable is refused by the database.
 */
enum ClaimKind: string
{
    case EXTERNAL_CONDITION = 'external_condition';
    case GEOMETRY = 'geometry';
    case INCLUDED_ITEMS = 'included_items';
    case CONDITION_AT_HANDOVER = 'condition_at_handover';
    case MECHANICAL_FUNCTION = 'mechanical_function';
    case WATER_RESISTANCE = 'water_resistance';
    case AUTHENTICITY = 'authenticity';

    /** Settled by comparing pictures and text against pictures and text. */
    private const WITHIN_PLATFORM_SCOPE = [
        self::EXTERNAL_CONDITION,
        self::GEOMETRY,
        self::INCLUDED_ITEMS,
        self::CONDITION_AT_HANDOVER,
    ];

    /** Needs a workshop, a pressure bench or an expert's hands. The platform has none. */
    private const OUTSIDE_PLATFORM_SCOPE = [
        self::MECHANICAL_FUNCTION,
        self::WATER_RESISTANCE,
        self::AUTHENTICITY,
    ];

    public function isAdjudicable(): bool
    {
        return in_array($this, self::WITHIN_PLATFORM_SCOPE, true);
    }

    public function requiresEscalation(): bool
    {
        return in_array($this, self::OUTSIDE_PLATFORM_SCOPE, true);
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }

    /**
     * @return list<string> the subset a decision on which cannot be committed as a refund
     *                      without an escalation reason
     */
    public static function unadjudicableValues(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::OUTSIDE_PLATFORM_SCOPE);
    }

    public static function fromWire(string $value): self
    {
        $case = self::tryFrom($value);
        if ($case === null) {
            throw new DisputeRuleViolation(sprintf(
                'Unknown claim kind "%s". Admissible: %s',
                $value,
                implode(', ', self::values()),
            ));
        }

        return $case;
    }

    /**
     * The sentence the platform owes the party whose claim sits here: a plain statement
     * that this is not decided here, with no promise about the outcome anywhere else.
     */
    public function cannotAdjudicateBecause(): string
    {
        return match ($this) {
            self::MECHANICAL_FUNCTION => 'Whether this item runs, and how accurately, cannot be seen in a '
                . 'photograph or a 3D model. NasTech has not put it on a timing bench.',
            self::WATER_RESISTANCE => 'Whether this item keeps water out is measured on a pressure bench. '
                . 'NasTech has not put this item on one, and no image can show the result.',
            self::AUTHENTICITY => 'Whether this item is what the listing says it is needs the case opened '
                . 'by someone with the reference records. A model shows the shape of the thing, not its provenance.',
            default => 'This claim is inside what the platform can compare.',
        };
    }
}
