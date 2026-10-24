<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * One delivery address in a subject's address book.
 *
 * The columns are nullable because erasure NULLs them in place: the row is
 * evidence that an address existed for this account at `createdAt` (ECT Act
 * s.15 order records), while the address itself is personal data. A live
 * address, on the other hand, must satisfy the same rules the DDL states —
 * a blank recipient name, a three-digit postal code and a spelled-out province
 * are refused here so the caller gets a sentence rather than a constraint
 * violation from inside commit().
 *
 * "One default per account" is a unique index on `default_claim_key`, which is
 * the account id while default and NULL otherwise. Setting a new default is a
 * two-row write done by SetDefaultAddress inside one transaction.
 */
final class Address
{
    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            accountId: (string) $row['account_id'],
            label: $row['label'] === null ? null : (string) $row['label'],
            recipientName: $row['recipient_name'] === null ? null : (string) $row['recipient_name'],
            line1: $row['line1'] === null ? null : (string) $row['line1'],
            line2: $row['line2'] === null ? null : (string) $row['line2'],
            locality: $row['locality'] === null ? null : (string) $row['locality'],
            provinceCode: $row['province_code'] === null ? null : (string) $row['province_code'],
            postalCode: $row['postal_code'] === null ? null : (string) $row['postal_code'],
            isDefault: (bool) $row['is_default'],
            defaultClaimKey: $row['default_claim_key'] === null ? null : (string) $row['default_claim_key'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
        );
    }

    private function __construct(
        public readonly string $id,
        public readonly string $accountId,
        public ?string $label,
        public ?string $recipientName,
        public ?string $line1,
        public ?string $line2,
        public ?string $locality,
        public ?string $provinceCode,
        public ?string $postalCode,
        public bool $isDefault,
        public ?string $defaultClaimKey,
        public readonly \DateTimeImmutable $createdAt,
    ) {
    }

    public static function create(
        string $id,
        string $accountId,
        ?string $label,
        string $recipientName,
        string $line1,
        ?string $line2,
        ?string $locality,
        ?string $provinceCode,
        ?string $postalCode,
        \DateTimeImmutable $now,
    ): self {
        $address = new self(
            id: $id,
            accountId: $accountId,
            label: self::optional($label),
            recipientName: self::required($recipientName, 'A recipient name'),
            line1: self::required($line1, 'The first address line'),
            line2: self::optional($line2),
            locality: self::optional($locality),
            provinceCode: null,
            postalCode: null,
            isDefault: false,
            defaultClaimKey: null,
            createdAt: $now,
        );
        $address->setProvince($provinceCode);
        $address->setPostalCode($postalCode);

        return $address;
    }

    public function markDefault(): void
    {
        $this->isDefault = true;
        $this->defaultClaimKey = $this->accountId;
    }

    public function clearDefault(): void
    {
        $this->isDefault = false;
        $this->defaultClaimKey = null;
    }

    public function setProvince(?string $provinceCode): void
    {
        if ($provinceCode === null) {
            $this->provinceCode = null;

            return;
        }
        $upper = strtoupper(trim($provinceCode));
        if (preg_match('/^[A-Z]{2}$/', $upper) !== 1) {
            throw new \InvalidArgumentException('A province is its two-letter code, e.g. GP or WC');
        }
        $this->provinceCode = $upper;
    }

    public function setPostalCode(?string $postalCode): void
    {
        if ($postalCode === null) {
            $this->postalCode = null;

            return;
        }
        $trimmed = trim($postalCode);
        if (preg_match('/^[1-9]\d{3}$/', $trimmed) !== 1) {
            throw new \InvalidArgumentException('A South African postal code is four digits, first nonzero');
        }
        $this->postalCode = $trimmed;
    }

    /**
     * Erasure: every personal line goes NULL, the default claim is released,
     * and the row stays as the record that an address existed.
     */
    public function anonymise(): void
    {
        $this->label = null;
        $this->recipientName = null;
        $this->line1 = null;
        $this->line2 = null;
        $this->locality = null;
        $this->provinceCode = null;
        $this->postalCode = null;
        $this->clearDefault();
    }

    public function isAnonymised(): bool
    {
        return $this->recipientName === null && $this->line1 === null;
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'account_id' => $this->accountId,
            'label' => $this->label,
            'recipient_name' => $this->recipientName,
            'line1' => $this->line1,
            'line2' => $this->line2,
            'locality' => $this->locality,
            'province_code' => $this->provinceCode,
            'postal_code' => $this->postalCode,
            'is_default' => $this->isDefault,
            'default_claim_key' => $this->defaultClaimKey,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }

    private static function required(string $value, string $what): string
    {
        $trimmed = trim($value);
        if ($trimmed === '') {
            throw new \InvalidArgumentException("{$what} is required and cannot be blank");
        }

        return $trimmed;
    }

    private static function optional(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
