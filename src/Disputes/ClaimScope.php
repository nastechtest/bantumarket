<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * The three values `claim_scope` takes on the wire, transcribed verbatim from
 * `packages/api-contracts/src/index.ts`:
 *
 *     export type ClaimScope = 'geometry_and_external_condition' | 'condition_only' | 'none';
 *
 * They are transcribed and not invented, and
 * `NasTech\Tests\Disputes\ClaimScopeContractTest` reads that file and compares the two
 * lists, because this enum is the platform's promise about what a 3D render evidences.
 * A local synonym — `external_only`, `full`, `visual` — would read perfectly in PHP and
 * silently break every binding to the frontend, which is the exact drift
 * `SchemaParityTest` was written to catch in the money path.
 *
 * The scope is stored on the case as it stood at sale, inside the condition snapshot.
 * It is a contract term, not a display string: nothing in this module is permitted to
 * paraphrase `CLAIM_SCOPE_DISCLOSURE`, and nothing in this module may widen what a
 * scope-bearing render is taken to prove.
 */
enum ClaimScope: string
{
    /** Outer condition and shape only — not function, not water resistance, not authenticity. */
    case GEOMETRY_AND_EXTERNAL_CONDITION = 'geometry_and_external_condition';

    case CONDITION_ONLY = 'condition_only';

    /** Decorative model. It evidences nothing about the item. */
    case NONE = 'none';

    /**
     * @return list<string> the wire values, in declaration order
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }

    public static function fromWire(string $value): self
    {
        $case = self::tryFrom($value);
        if ($case === null) {
            throw new DisputeRuleViolation(sprintf(
                'claim_scope "%s" is not one of the three values the contract defines (%s). '
                . 'A dispute case records the scope the listing actually declared, and refuses anything else '
                . 'rather than storing a string no disclosure sentence exists for.',
                $value,
                implode(', ', self::values()),
            ));
        }

        return $case;
    }

    /**
     * Whether a render carrying this scope can settle an assertion about how a thing
     * works. It never can; the method exists so the answer is stated once.
     */
    public function evidencesFunction(): bool
    {
        return false;
    }
}
