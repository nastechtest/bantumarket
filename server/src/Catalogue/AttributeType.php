<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * The six answer shapes the DDL admits, and no seventh.
 *
 * A seventh type is a decision, not a data entry: it needs a cast rule, a unit
 * rule and a rendering, all of which live in PHP. Transcribed one-for-one from
 * the `data_type` CHECK in 006_catalogue.sql.
 */
enum AttributeType: string
{
    case IntegerRange = 'integer_range';
    case Enum = 'enum';
    case Boolean = 'boolean';
    case LengthMm = 'length_mm';
    case MoneyCents = 'money_cents';
    case DateService = 'date_service';

    /**
     * Types whose answer is a quantity measured on a stated scale.
     */
    public function isQuantity(): bool
    {
        return match ($this) {
            self::IntegerRange, self::LengthMm, self::MoneyCents => true,
            self::Enum, self::Boolean, self::DateService => false,
        };
    }

    public function requiresUnit(): bool
    {
        return $this->isQuantity();
    }

    /**
     * The units the DDL will accept for this type. Null means the type must not
     * carry a unit at all, which is a requirement rather than a permission.
     *
     * @return list<string>|null
     */
    public function allowedUnits(): ?array
    {
        return match ($this) {
            self::LengthMm => ['mm'],
            self::MoneyCents => ['ZAR'],
            self::IntegerRange => ['bar', 'm', 'count', 'years', 'g'],
            self::Enum, self::Boolean, self::DateService => null,
        };
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $type): string => $type->value, self::cases());
    }
}
