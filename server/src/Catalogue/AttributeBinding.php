<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * One frozen question inside a published category version.
 *
 * A binding is copied from an attribute definition at publish time, never joined
 * back to it. Six months later the definition may be renamed or retired; the
 * claim a buyer saw was the binding, and a dispute reads the binding.
 *
 * `validateAnswer()` is the whole vocabulary check: it accepts exactly one PHP
 * type per data type, checks enum membership and range bounds, and never casts.
 */
final class AttributeBinding
{
    /**
     * @param list<string> $optionCodes
     */
    public function __construct(
        public readonly string $attributeId,
        public readonly string $code,
        public readonly string $displayName,
        public readonly AttributeType $dataType,
        public readonly ?string $unit,
        public readonly array $optionCodes,
        public readonly ?int $lowerBound,
        public readonly ?int $upperBound,
        public readonly Provenance $provenance,
        public readonly ?string $disclaimer,
        public readonly bool $mandatory,
        public readonly int $displayOrder,
        public readonly ?string $guidance,
    ) {
        if ($this->code === '') {
            throw new InvalidAttributeDefinition('A binding must name its attribute code');
        }
        if ($this->dataType->requiresUnit() && $this->unit === null) {
            throw new InvalidAttributeDefinition("Binding \"{$this->code}\" is a quantity with no unit");
        }
        if ($this->dataType === AttributeType::Enum && $this->optionCodes === []) {
            throw new InvalidAttributeDefinition("Binding \"{$this->code}\" is an enum with no options");
        }
        if ($this->dataType !== AttributeType::Enum && $this->optionCodes !== []) {
            throw new InvalidAttributeDefinition("Binding \"{$this->code}\" carries options for a non-enum type");
        }
    }

    public static function fromDefinition(
        AttributeDefinition $definition,
        bool $mandatory,
        int $displayOrder,
    ): self {
        if ($definition->state === AttributeState::Draft) {
            throw new InvalidAttributeDefinition(sprintf(
                'Attribute "%s" is DRAFT; a published vocabulary cannot depend on a definition somebody is still writing',
                $definition->code,
            ));
        }

        return new self(
            attributeId: $definition->id,
            code: $definition->code,
            displayName: $definition->displayName,
            dataType: $definition->dataType,
            unit: $definition->unit,
            optionCodes: $definition->optionCodes ?? [],
            lowerBound: $definition->lowerBound,
            upperBound: $definition->upperBound,
            provenance: $definition->provenance,
            disclaimer: $definition->disclaimer,
            mandatory: $mandatory,
            displayOrder: $displayOrder,
            guidance: $definition->guidanceText,
        );
    }

    /**
     * Refuse a value that is not exactly this binding's type, or that is outside
     * the frozen option/bound set. Returns the type's canonical representation,
     * which is identical to the accepted input for every launch type.
     */
    public function validateAnswer(mixed $value): int|string|bool
    {
        return match ($this->dataType) {
            AttributeType::IntegerRange => $this->validateIntegerRange($value),
            AttributeType::Enum => $this->validateEnum($value),
            AttributeType::Boolean => $this->validateBoolean($value),
            AttributeType::LengthMm => $this->validateLength($value),
            AttributeType::MoneyCents => $this->validateMoney($value),
            AttributeType::DateService => $this->validateServiceDate($value),
        };
    }

    /**
     * The canonical shape the vocabulary digest is computed over. Sorted by code
     * by the caller so the digest does not depend on form order.
     *
     * @return array<string,mixed>
     */
    public function canonical(): array
    {
        return [
            'attribute_id' => $this->attributeId,
            'code' => $this->code,
            'display_name' => $this->displayName,
            'data_type' => $this->dataType->value,
            'unit' => $this->unit,
            'option_codes' => $this->optionCodes,
            'lower_bound' => $this->lowerBound,
            'upper_bound' => $this->upperBound,
            'provenance' => $this->provenance->value,
            'disclaimer' => $this->disclaimer,
            'mandatory' => $this->mandatory,
            'display_order' => $this->displayOrder,
            'guidance' => $this->guidance,
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'attribute_id' => $this->attributeId,
            'code' => $this->code,
            'display_name' => $this->displayName,
            'data_type' => $this->dataType->value,
            'unit' => $this->unit,
            'option_codes' => $this->optionCodes === [] ? null : $this->optionCodes,
            'lower_bound' => $this->lowerBound,
            'upper_bound' => $this->upperBound,
            'provenance' => $this->provenance->value,
            'disclaimer' => $this->disclaimer,
            'mandatory' => $this->mandatory,
            'display_order' => $this->displayOrder,
            'guidance' => $this->guidance,
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromArray(array $row): self
    {
        $options = $row['option_codes'] ?? [];

        return new self(
            attributeId: (string) $row['attribute_id'],
            code: (string) $row['code'],
            displayName: (string) $row['display_name'],
            dataType: AttributeType::from((string) $row['data_type']),
            unit: ($row['unit'] ?? null) === null ? null : (string) $row['unit'],
            optionCodes: is_array($options) ? array_values(array_map('strval', $options)) : [],
            lowerBound: ($row['lower_bound'] ?? null) === null ? null : (int) $row['lower_bound'],
            upperBound: ($row['upper_bound'] ?? null) === null ? null : (int) $row['upper_bound'],
            provenance: Provenance::from((string) $row['provenance']),
            disclaimer: ($row['disclaimer'] ?? null) === null ? null : (string) $row['disclaimer'],
            mandatory: (bool) $row['mandatory'],
            displayOrder: (int) $row['display_order'],
            guidance: ($row['guidance'] ?? null) === null ? null : (string) $row['guidance'],
        );
    }

    private function validateIntegerRange(mixed $value): int
    {
        if (!is_int($value)) {
            throw new InvalidAttributeValue($this->code, sprintf(
                'expected an integer on the %s scale, got %s',
                (string) $this->unit,
                get_debug_type($value),
            ));
        }
        if ($this->lowerBound !== null && $value < $this->lowerBound) {
            throw new InvalidAttributeValue($this->code, sprintf(
                '%d is below the allowed lower bound %d %s',
                $value,
                $this->lowerBound,
                (string) $this->unit,
            ));
        }
        if ($this->upperBound !== null && $value > $this->upperBound) {
            throw new InvalidAttributeValue($this->code, sprintf(
                '%d is above the allowed upper bound %d %s',
                $value,
                $this->upperBound,
                (string) $this->unit,
            ));
        }

        return $value;
    }

    private function validateEnum(mixed $value): string
    {
        if (!is_string($value)) {
            throw new InvalidAttributeValue($this->code, sprintf(
                'expected one of [%s], got %s',
                implode(', ', $this->optionCodes),
                get_debug_type($value),
            ));
        }
        if (!in_array($value, $this->optionCodes, true)) {
            throw new InvalidAttributeValue($this->code, sprintf(
                '"%s" is not one of [%s]',
                $value,
                implode(', ', $this->optionCodes),
            ));
        }

        return $value;
    }

    private function validateBoolean(mixed $value): bool
    {
        if (!is_bool($value)) {
            throw new InvalidAttributeValue($this->code, sprintf(
                'expected true or false, got %s; a truthy value is not a boolean',
                get_debug_type($value),
            ));
        }

        return $value;
    }

    private function validateLength(mixed $value): int
    {
        if (!is_int($value)) {
            throw new InvalidAttributeValue($this->code, sprintf(
                'expected whole millimetres as an integer, got %s',
                get_debug_type($value),
            ));
        }
        if ($value < 0) {
            throw new InvalidAttributeValue($this->code, 'a length cannot be negative');
        }

        return $value;
    }

    private function validateMoney(mixed $value): int
    {
        if (!is_int($value)) {
            throw new InvalidAttributeValue($this->code, sprintf(
                'expected integer cents, got %s',
                get_debug_type($value),
            ));
        }
        if ($value < 0) {
            throw new InvalidAttributeValue($this->code, 'a money amount cannot be negative');
        }

        return $value;
    }

    private function validateServiceDate(mixed $value): string
    {
        if (!is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) {
            throw new InvalidAttributeValue($this->code, sprintf(
                'expected a calendar day in YYYY-MM-DD form, got %s',
                is_string($value) ? '"' . $value . '"' : get_debug_type($value),
            ));
        }
        $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if ($parsed === false || $parsed->format('Y-m-d') !== $value) {
            throw new InvalidAttributeValue($this->code, sprintf(
                '"%s" is not a real calendar day',
                $value,
            ));
        }

        return $parsed->format('Y-m-d');
    }
}
