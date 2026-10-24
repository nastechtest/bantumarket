<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * A South African phone number in E.164.
 *
 * Phone-first is the product's premise: the number is the identity anchor, so
 * normalisation happens once, at the edge, and nothing downstream ever sees
 * "082 123 4567" and "+27821234567" as two different principals. The accepted
 * input shapes are exactly the ones South Africans type:
 *
 *   +27 82 123 4567 | 0027 82... | 27821234567 | 0821234567 | +27821234567
 *
 * Anything else — a foreign number, a local loop with letters, seven digits —
 * is refused. The launch is South Africa only (spec v1.1 §2), and a phone that
 * normalises to two strings is two accounts with one ledger join each, which
 * is how seller balances get invented.
 *
 * The anonymised digest an erasure leaves behind ("erased_" + 64 hex) passes
 * through unchanged: Account rows keep living after erasure, and a value
 * object that refused its own erased column would make the erasure path
 * untestable.
 */
final class PhoneNumber
{
    private const SA_E164 = '/^\+27[1-9]\d{8}$/';
    private const ERASED = '/^erased_[0-9a-f]{64}$/';

    private function __construct(public readonly string $e164)
    {
    }

    public static function fromString(string $raw): self
    {
        $digits = preg_replace('/[\s\-().]+/', '', trim($raw)) ?? '';

        $candidates = [];
        if (str_starts_with($digits, '+27')) {
            $candidates[] = $digits;
        } elseif (str_starts_with($digits, '0027')) {
            $candidates[] = '+' . substr($digits, 2);
        } elseif (str_starts_with($digits, '27')) {
            $candidates[] = '+' . $digits;
        } elseif (str_starts_with($digits, '0')) {
            $candidates[] = '+27' . substr($digits, 1);
        }

        foreach ($candidates as $candidate) {
            if (preg_match(self::SA_E164, $candidate) === 1) {
                return new self($candidate);
            }
        }

        if (preg_match(self::ERASED, $digits) === 1) {
            return new self($digits);
        }

        throw new \InvalidArgumentException(
            'Not a South African mobile number: expected +27 followed by 9 digits '
            . '(082 123 4567 and 27821234567 normalise; foreign or seven-digit numbers do not)'
        );
    }

    /**
     * True for the anonymised digest an erasure leaves in the phone column.
     * A caller that means "a number a human can dial" must not accept this.
     */
    public function isAnonymised(): bool
    {
        return preg_match(self::ERASED, $this->e164) === 1;
    }

    public function equals(self $other): bool
    {
        return $this->e164 === $other->e164;
    }

    public function __toString(): string
    {
        return $this->e164;
    }
}
