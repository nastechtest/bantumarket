<?php

declare(strict_types=1);

namespace NasTech\Payouts;

/**
 * The banks a seller may be paid to, as a closed vocabulary.
 *
 * Closed on purpose. A free-text brand column becomes a column full of
 * "Capitec", "capitec bank" and "CPT", and nobody can total payouts per bank
 * afterwards. `other` exists for a legitimate bank outside the launch list; it
 * is a value, not an escape hatch that accepts whatever was typed.
 *
 * The list is mirrored by `masked_brand_is_known` in 014_payouts.sql and
 * PayoutsDdlTest compares the two in both directions.
 */
enum BankBrand: string
{
    case Capitec = 'capitec';
    case Fnb = 'fnb';
    case Absa = 'absa';
    case StandardBank = 'standard_bank';
    case Nedbank = 'nedbank';
    case Tyme = 'tyme';
    case Discovery = 'discovery';
    case Investec = 'investec';
    case Other = 'other';

    public function label(): string
    {
        return match ($this) {
            self::Capitec => 'Capitec',
            self::Fnb => 'FNB',
            self::Absa => 'Absa',
            self::StandardBank => 'Standard Bank',
            self::Nedbank => 'Nedbank',
            self::Tyme => 'TymeBank',
            self::Discovery => 'Discovery Bank',
            self::Investec => 'Investec',
            self::Other => 'Other bank',
        };
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $brand): string => $brand->value, self::cases());
    }
}
