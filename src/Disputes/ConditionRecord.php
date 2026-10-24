<?php

declare(strict_types=1);

namespace NasTech\Disputes;

use NasTech\Listings\Listing;
use NasTech\SharedKernel\Money;

/**
 * The listing's condition record, as a value — the thing that gets frozen into a case.
 *
 * It is a value object rather than a live read for one reason stated in the brief: an
 * edit after a dispute is opened must not change what the case reads. If `DisputeCase`
 * held a `listing_id` and asked `Listings` for the text at decision time, a seller who
 * quietly re-worded a disclosure would re-decide their own dispute, and the staff console
 * would have no way to see that it happened. So the record is copied, hashed, and stored
 * beside the case, and the case's read pointer never moves.
 *
 * The listing-derived fields (title, category, price, status, serial) are read from
 * `Listings` at open; `claim_scope` and the disclosures arrive on the command, because
 * they live on the asset manifest and `Disputes` has no edge to `Media` or `Catalogue` —
 * see the WIRE-AT-INTEGRATION note in the module README. What this class guarantees is
 * that whatever was passed in is what is kept, verbatim.
 */
final class ConditionRecord
{
    public const SNAPSHOT_TABLE = 'dispute_condition_snapshots';

    public const ORIGIN_AT_OPEN = 'AT_OPEN';
    public const ORIGIN_EDIT_AFTER_OPEN = 'EDIT_AFTER_OPEN';

    /** @var list<Disclosure> */
    public readonly array $disclosures;

    /**
     * @param list<Disclosure> $disclosures
     */
    public function __construct(
        public readonly string $listingId,
        public readonly string $title,
        public readonly string $category,
        public readonly Money $price,
        public readonly string $listingStatus,
        public readonly ?string $serialOrImei,
        public readonly ClaimScope $claimScope,
        array $disclosures,
    ) {
        // Order-insensitive fingerprinting needs an order, so the record normalises one
        // here rather than carrying two representations of the same list.
        $ids = array_map(static fn (Disclosure $d): string => $d->disclosureId, $disclosures);
        if (count($ids) !== count(array_unique($ids))) {
            throw new DisputeRuleViolation(
                'The condition record repeats a disclosure id; a case cannot hold two different '
                . 'texts under one pointer.'
            );
        }

        usort($disclosures, static fn (Disclosure $a, Disclosure $b): int => strcmp($a->disclosureId, $b->disclosureId));
        $this->disclosures = $disclosures;
    }

    /**
     * Assemble from the live listing plus the contract values the caller supplies.
     *
     * @param list<Disclosure> $disclosures
     */
    public static function fromListing(
        Listing $listing,
        ClaimScope $claimScope,
        array $disclosures,
    ): self {
        return new self(
            listingId: $listing->id,
            title: $listing->title,
            category: $listing->category,
            price: $listing->price,
            listingStatus: $listing->status,
            serialOrImei: $listing->serialOrImei,
            claimScope: $claimScope,
            disclosures: $disclosures,
        );
    }

    /**
     * A content-addressed digest of everything a decision would be comparing this record
     * against. Two records with the same fingerprint are the same evidence, whatever the
     * row ids say, and `changedFieldsAgainst()` is only asked when they differ.
     */
    public function fingerprint(): string
    {
        return hash('sha256', json_encode($this->material(), JSON_UNESCAPED_SLASHES) ?: '');
    }

    /**
     * @return array<string,mixed>
     */
    public function material(): array
    {
        return [
            'listing_id' => $this->listingId,
            'title' => $this->title,
            'category' => $this->category,
            'price_cents' => $this->price->cents,
            'currency' => $this->price->currency,
            'listing_status' => $this->listingStatus,
            'serial_or_imei' => $this->serialOrImei,
            'claim_scope' => $this->claimScope->value,
            'disclosures' => array_map(static fn (Disclosure $d): array => $d->toArray(), $this->disclosures),
        ];
    }

    /**
     * Which top-level fields differ from an earlier record, in a stable order.
     *
     * `disclosures` is reported as one field rather than as per-caption ids: the case shows
     * the two texts side by side and the resolver reads the difference. Naming individual
     * caption ids here would be a diff engine this module has no reason to own.
     *
     * @return list<string>
     */
    public function changedFieldsAgainst(self $earlier): array
    {
        $changed = [];
        foreach ([
            'title' => 'listing_title',
            'category' => 'listing_category',
            'listingStatus' => 'listing_status',
            'serialOrImei' => 'serial_or_imei',
        ] as $property => $column) {
            if ((string) $this->{$property} !== (string) $earlier->{$property}) {
                $changed[] = $column;
            }
        }

        if (!$this->price->equals($earlier->price)) {
            $changed[] = 'listing_price_cents';
        }
        if ($this->claimScope !== $earlier->claimScope) {
            $changed[] = 'claim_scope';
        }
        if (array_map(static fn (Disclosure $d): array => $d->toArray(), $this->disclosures)
            !== array_map(static fn (Disclosure $d): array => $d->toArray(), $earlier->disclosures)) {
            $changed[] = 'disclosures';
        }

        sort($changed);

        return $changed;
    }

    /**
     * @return list<string>
     */
    public function disclosureTexts(): array
    {
        return array_map(static fn (Disclosure $d): string => $d->text, $this->disclosures);
    }

    /**
     * The row for `disputes.dispute_condition_snapshots`.
     *
     * @param list<string> $changedFields
     *
     * @return array<string,mixed>
     */
    public function toSnapshotRow(
        string $id,
        string $caseId,
        int $sequence,
        string $origin,
        array $changedFields,
        \DateTimeImmutable $capturedAt,
    ): array {
        if (!in_array($origin, [self::ORIGIN_AT_OPEN, self::ORIGIN_EDIT_AFTER_OPEN], true)) {
            throw new DisputeRuleViolation("Unknown snapshot origin: {$origin}");
        }

        return [
            'id' => $id,
            'case_id' => $caseId,
            'sequence' => $sequence,
            'origin' => $origin,
            'listing_id' => $this->listingId,
            'claim_scope' => $this->claimScope->value,
            'listing_title' => $this->title,
            'listing_category' => $this->category,
            'listing_price_cents' => $this->price->cents,
            'currency' => $this->price->currency,
            'listing_status' => $this->listingStatus,
            'serial_or_imei' => $this->serialOrImei,
            'disclosures' => array_map(static fn (Disclosure $d): array => $d->toArray(), $this->disclosures),
            'fingerprint' => $this->fingerprint(),
            'changed_fields' => implode(',', $changedFields),
            'captured_at' => $capturedAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromSnapshotRow(array $row): self
    {
        /** @var list<array<string,mixed>> $captions */
        $captions = is_array($row['disclosures']) ? $row['disclosures'] : [];

        return new self(
            listingId: (string) ($row['listing_id'] ?? ''),
            title: (string) $row['listing_title'],
            category: (string) $row['listing_category'],
            price: Money::fromCents((int) $row['listing_price_cents'], (string) $row['currency']),
            listingStatus: (string) $row['listing_status'],
            serialOrImei: $row['serial_or_imei'] === null ? null : (string) $row['serial_or_imei'],
            claimScope: ClaimScope::fromWire((string) $row['claim_scope']),
            disclosures: array_map(static fn (array $d): Disclosure => Disclosure::fromRow($d), $captions),
        );
    }

    /**
     * @param array<string,mixed> $row
     * @return list<string>
     */
    public static function changedFieldsFromRow(array $row): array
    {
        $raw = (string) ($row['changed_fields'] ?? '');

        return $raw === '' ? [] : explode(',', $raw);
    }
}
