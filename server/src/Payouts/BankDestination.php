<?php

declare(strict_types=1);

namespace NasTech\Payouts;

/**
 * A bank destination, held in the only shape this module will store: brand plus
 * the last four digits.
 *
 * Three things may never enter this object in any field — a full account
 * number, a South African ID number, or a card number — and the check runs on
 * both constructor arguments before anything else, so a caller that passes
 * "1234567890" as the brand gets a refusal that names the account number, not a
 * confusing "unknown brand". The value is never echoed back.
 *
 * The longer claim: masking at the edge is not enough if the unmasked value is
 * accepted and masked later. By the time a destination exists, the only digits
 * in it are four. There is no method to recover the account number because the
 * module never had it.
 */
final class BankDestination
{
    public readonly BankBrand $brand;
    public readonly string $lastFour;

    public function __construct(string $brand, string $lastFour)
    {
        self::refuseSensitiveDetail('brand', $brand);
        self::refuseSensitiveDetail('last_four', $lastFour);

        $knownBrand = BankBrand::tryFrom(strtolower(trim($brand)));
        if ($knownBrand === null) {
            throw new \InvalidArgumentException(sprintf(
                'Unknown bank brand "%s"; 014_payouts.sql and BankBrand must agree',
                trim($brand),
            ));
        }

        $digits = trim($lastFour);
        if (preg_match('/^[0-9]{4}$/', $digits) !== 1) {
            throw new \InvalidArgumentException('A masked destination stores exactly four digits, never the account number');
        }

        $this->brand = $knownBrand;
        $this->lastFour = $digits;
    }

    public function masked(): string
    {
        return sprintf('%s •••• %s', $this->brand->label(), $this->lastFour);
    }

    public function equals(self $other): bool
    {
        return $this->brand === $other->brand && $this->lastFour === $other->lastFour;
    }

    /**
     * @return array{bank_brand: string, bank_last_four: string}
     */
    public function toRow(): array
    {
        return [
            'bank_brand' => $this->brand->value,
            'bank_last_four' => $this->lastFour,
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self((string) $row['bank_brand'], (string) $row['bank_last_four']);
    }

    /**
     * The refusal is by shape, not by column. A 13-digit run is an ID number, a
     * 16-or-more-digit run is a card, and a 6-to-12-digit run is an account
     * number — in either field, because "put it in the brand column" is exactly
     * the mistake a hurried integration makes.
     */
    private static function refuseSensitiveDetail(string $field, string $value): void
    {
        $digits = preg_replace('/[^0-9]/', '', $value) ?? '';
        $length = strlen($digits);

        if ($length === 0 || $length <= 4) {
            return;
        }

        $kind = match (true) {
            $length >= 14 => SensitiveBankDetailRefused::CARD_NUMBER,
            $length === 13 => SensitiveBankDetailRefused::ID_NUMBER,
            $length >= 6 => SensitiveBankDetailRefused::ACCOUNT_NUMBER,
            default => null,
        };

        if ($kind === null) {
            // Five digits is neither a last-four nor a payment instrument. The
            // four-digit rule below refuses it; calling it an account number
            // would be a lie.
            return;
        }

        throw new SensitiveBankDetailRefused($kind, $field);
    }
}
