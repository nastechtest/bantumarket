<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * One frozen copy of a listing's condition record, with the provenance a case
 * needs to defend it.
 *
 * Sequence 1 is always ORIGIN_AT_OPEN and is the only copy a decision reads.
 * Later rows are ORIGIN_EDIT_AFTER_OPEN: they record that the seller changed
 * the listing while the case was live, which is evidence in its own right. The
 * edit row never replaces the opening row, so "what the listing said at sale"
 * cannot be rewritten by the person the case is about.
 *
 * The fingerprint is the content hash of ConditionRecord::material(), not of
 * the row id: two rows with the same text are the same evidence, and a row whose
 * text changed necessarily has a different fingerprint.
 */
final class ConditionSnapshot
{
    public const ORIGIN_AT_OPEN = ConditionRecord::ORIGIN_AT_OPEN;
    public const ORIGIN_EDIT_AFTER_OPEN = ConditionRecord::ORIGIN_EDIT_AFTER_OPEN;

    /** @var list<string> every field a listing edit can change that a case shows */
    public const CHANGED_FIELDS = [
        'claim_scope',
        'disclosures',
        'listing_category',
        'listing_price_cents',
        'listing_status',
        'listing_title',
        'serial_or_imei',
    ];

    /** @var list<string> */
    public readonly array $changedFields;

    /**
     * @param list<string> $changedFields
     */
    public function __construct(
        public readonly string $id,
        public readonly int $sequence,
        public readonly string $origin,
        array $changedFields,
        public readonly \DateTimeImmutable $capturedAt,
        public readonly ConditionRecord $record,
    ) {
        if ($sequence < 1) {
            throw new DisputeRuleViolation('A condition snapshot has a positive sequence');
        }
        if (!in_array($origin, [self::ORIGIN_AT_OPEN, self::ORIGIN_EDIT_AFTER_OPEN], true)) {
            throw new DisputeRuleViolation("Unknown condition snapshot origin: {$origin}");
        }
        if ($sequence === 1 && $origin !== self::ORIGIN_AT_OPEN) {
            throw new DisputeRuleViolation(
                'The first condition snapshot is the one taken when the case opened; it cannot be an edit row'
            );
        }
        if ($sequence > 1 && $origin !== self::ORIGIN_EDIT_AFTER_OPEN) {
            throw new DisputeRuleViolation(
                'Only the first snapshot is taken at open; a later snapshot exists because the listing was edited'
            );
        }

        foreach ($changedFields as $field) {
            if (!in_array($field, self::CHANGED_FIELDS, true)) {
                throw new DisputeRuleViolation(
                    "Unknown changed field \"{$field}\" on a condition snapshot. A case shows: "
                    . implode(', ', self::CHANGED_FIELDS)
                );
            }
        }
        $changedFields = array_values(array_unique($changedFields));
        sort($changedFields);
        if ($origin === self::ORIGIN_AT_OPEN && $changedFields !== []) {
            throw new DisputeRuleViolation('The snapshot taken at open changed nothing; listing it as an edit is false');
        }
        if ($origin === self::ORIGIN_EDIT_AFTER_OPEN && $changedFields === []) {
            throw new DisputeRuleViolation(
                'An edit-after-open snapshot with no changed field is not evidence of an edit; '
                . 'the caller should have detected the fingerprint match and written nothing'
            );
        }
        $this->changedFields = $changedFields;
    }

    public static function atOpen(string $id, \DateTimeImmutable $capturedAt, ConditionRecord $record): self
    {
        return new self($id, 1, self::ORIGIN_AT_OPEN, [], $capturedAt, $record);
    }

    /**
     * @param list<string> $changedFields
     */
    public static function editAfterOpen(
        string $id,
        int $sequence,
        array $changedFields,
        \DateTimeImmutable $capturedAt,
        ConditionRecord $record,
    ): self {
        return new self($id, $sequence, self::ORIGIN_EDIT_AFTER_OPEN, $changedFields, $capturedAt, $record);
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(string $caseId): array
    {
        return $this->record->toSnapshotRow(
            id: $this->id,
            caseId: $caseId,
            sequence: $this->sequence,
            origin: $this->origin,
            changedFields: $this->changedFields,
            capturedAt: $this->capturedAt,
        );
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            sequence: (int) $row['sequence'],
            origin: (string) $row['origin'],
            changedFields: ConditionRecord::changedFieldsFromRow($row),
            capturedAt: new \DateTimeImmutable((string) $row['captured_at']),
            record: ConditionRecord::fromSnapshotRow($row),
        );
    }
}
