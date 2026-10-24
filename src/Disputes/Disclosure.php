<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * One written disclosure on a listing's condition record.
 *
 * The shape is `ConditionCaption` from `packages/api-contracts` narrowed to the three
 * fields a dispute reads: the id the overlay points at, the text, and the severity the
 * overlay carries. Position and hotspot are deliberately absent — they belong to the
 * scene runtime, and `DisputeCase` is read by a resolver in a text panel.
 *
 * `disclosureId` is the join the whole 3D programme depends on: the overlay on the render
 * is a pointer, and the text stored here is the evidence. If a dispute were ever decided
 * against the pointer rather than the text, a caption edit would silently re-decide a
 * closed case.
 */
final class Disclosure
{
    public const SEVERITY_COSMETIC = 'cosmetic';
    public const SEVERITY_FUNCTIONAL = 'functional';
    public const SEVERITY_UNKNOWN = 'unknown';

    /** @var list<string> the severity vocabulary of `ConditionCaption`, not a fourth value */
    public const SEVERITIES = [self::SEVERITY_COSMETIC, self::SEVERITY_FUNCTIONAL, self::SEVERITY_UNKNOWN];

    public function __construct(
        public readonly string $disclosureId,
        public readonly string $text,
        public readonly string $severity,
    ) {
        if (trim($disclosureId) === '') {
            throw new DisputeRuleViolation('A disclosure without an id cannot be joined to the overlay that cites it');
        }
        if (trim($text) === '') {
            throw new DisputeRuleViolation(
                "Disclosure {$disclosureId} has no text. A blank disclosure is read by a resolver as "
                . '"nothing was disclosed", which is a finding, not an absence of one.'
            );
        }
        if (!in_array($severity, self::SEVERITIES, true)) {
            throw new DisputeRuleViolation(sprintf(
                'Unknown disclosure severity "%s". The condition record uses: %s',
                $severity,
                implode(', ', self::SEVERITIES),
            ));
        }
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            disclosureId: (string) ($row['disclosure_id'] ?? ''),
            text: (string) ($row['disclosure_text'] ?? ''),
            severity: (string) ($row['severity'] ?? self::SEVERITY_UNKNOWN),
        );
    }

    /**
     * @return array<string,string>
     */
    public function toArray(): array
    {
        return [
            'disclosure_id' => $this->disclosureId,
            'disclosure_text' => $this->text,
            'severity' => $this->severity,
        ];
    }

    public function equals(self $other): bool
    {
        return $this->toArray() === $other->toArray();
    }
}
