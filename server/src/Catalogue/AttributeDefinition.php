<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * An attribute is a question the platform asks a seller, with a type that makes
 * the answer machine-checkable and a unit that makes it comparable.
 *
 * Every rule in the constructor is a named CHECK in 006_catalogue.sql. They are
 * repeated here because the in-memory tests run without PostgreSQL: a definition
 * that can be constructed in PHP must be one the storage engine would accept.
 */
final class AttributeDefinition
{
    public const CODE_PATTERN = '/^[a-z][a-z0-9_]{1,40}$/';

    /**
     * @param list<string>|null $optionCodes
     */
    public function __construct(
        public readonly string $id,
        public readonly string $code,
        public readonly string $displayName,
        public readonly AttributeType $dataType,
        public readonly ?string $unit,
        public readonly ?array $optionCodes,
        public readonly ?int $lowerBound,
        public readonly ?int $upperBound,
        public readonly Provenance $provenance,
        public readonly ?string $disclaimer,
        public readonly ?string $guidanceText,
        public readonly AttributeState $state,
        public readonly int $revision,
        public readonly \DateTimeImmutable $createdAt,
        public readonly ?\DateTimeImmutable $retiredAt,
    ) {
        if ($this->id === '') {
            throw new InvalidAttributeDefinition('An attribute definition must have an id');
        }
        if (preg_match(self::CODE_PATTERN, $this->code) !== 1) {
            throw new InvalidAttributeDefinition(sprintf(
                'Attribute code "%s" must be lowercase, start with a letter and use underscores',
                $this->code,
            ));
        }
        if (trim($this->displayName) === '') {
            throw new InvalidAttributeDefinition('An attribute definition must have a display name');
        }
        if ($this->dataType->requiresUnit()) {
            if ($this->unit === null) {
                throw new InvalidAttributeDefinition(sprintf(
                    'Attribute "%s" is %s and must name its unit; a number without a scale is the ambiguity this type exists to remove',
                    $this->code,
                    $this->dataType->value,
                ));
            }
            $allowed = $this->dataType->allowedUnits() ?? [];
            if (!in_array($this->unit, $allowed, true)) {
                throw new InvalidAttributeDefinition(sprintf(
                    'Attribute "%s" is %s and its unit must be one of %s; got "%s"',
                    $this->code,
                    $this->dataType->value,
                    implode(', ', $allowed),
                    $this->unit,
                ));
            }
        } elseif ($this->unit !== null) {
            throw new InvalidAttributeDefinition(sprintf(
                'Attribute "%s" is %s and must not carry a unit',
                $this->code,
                $this->dataType->value,
            ));
        }

        if ($this->dataType === AttributeType::Enum) {
            if ($this->optionCodes === null || $this->optionCodes === []) {
                throw new InvalidAttributeDefinition(sprintf(
                    'Enum attribute "%s" must list at least one option; a question with no answers can never be answered',
                    $this->code,
                ));
            }
            $seen = [];
            foreach ($this->optionCodes as $option) {
                if (!is_string($option) || trim($option) === '') {
                    throw new InvalidAttributeDefinition(sprintf(
                        'Enum attribute "%s" has a blank or non-string option code',
                        $this->code,
                    ));
                }
                if (isset($seen[$option])) {
                    throw new InvalidAttributeDefinition(sprintf(
                        'Enum attribute "%s" repeats option "%s"; a facet cannot show the same answer twice',
                        $this->code,
                        $option,
                    ));
                }
                $seen[$option] = true;
            }
        } elseif ($this->optionCodes !== null) {
            throw new InvalidAttributeDefinition(sprintf(
                'Attribute "%s" is %s; only an enum may carry an option list',
                $this->code,
                $this->dataType->value,
            ));
        }

        if ($this->dataType !== AttributeType::IntegerRange
            && ($this->lowerBound !== null || $this->upperBound !== null)) {
            throw new InvalidAttributeDefinition(sprintf(
                'Attribute "%s" is %s; range bounds belong to an integer range only',
                $this->code,
                $this->dataType->value,
            ));
        }
        if ($this->lowerBound !== null && $this->upperBound !== null && $this->lowerBound >= $this->upperBound) {
            throw new InvalidAttributeDefinition(sprintf(
                'Attribute "%s" has an empty range [%d, %d); it would refuse every answer',
                $this->code,
                $this->lowerBound,
                $this->upperBound,
            ));
        }

        if ($this->provenance === Provenance::StatedBySeller
            && ($this->disclaimer === null || trim($this->disclaimer) === '')) {
            throw new InvalidAttributeDefinition(sprintf(
                'Attribute "%s" is stated by the seller and must carry the disclaimer that says so',
                $this->code,
            ));
        }
        if ($this->revision < 1) {
            throw new InvalidAttributeDefinition('An attribute definition revision starts at 1');
        }
    }

    /**
     * @param list<string>|null $optionCodes
     */
    public static function define(
        string $id,
        string $code,
        string $displayName,
        AttributeType $dataType,
        Provenance $provenance,
        \DateTimeImmutable $createdAt,
        ?string $unit = null,
        ?array $optionCodes = null,
        ?int $lowerBound = null,
        ?int $upperBound = null,
        ?string $disclaimer = null,
        ?string $guidanceText = null,
        AttributeState $state = AttributeState::Live,
    ): self {
        return new self(
            id: $id,
            code: $code,
            displayName: trim($displayName),
            dataType: $dataType,
            unit: $unit,
            optionCodes: $optionCodes,
            lowerBound: $lowerBound,
            upperBound: $upperBound,
            provenance: $provenance,
            disclaimer: $disclaimer,
            guidanceText: $guidanceText,
            state: $state,
            revision: 1,
            createdAt: $createdAt,
            retiredAt: null,
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'display_name' => $this->displayName,
            'data_type' => $this->dataType->value,
            'unit' => $this->unit,
            'option_codes' => $this->optionCodes,
            'lower_bound' => $this->lowerBound,
            'upper_bound' => $this->upperBound,
            'provenance' => $this->provenance->value,
            'disclaimer' => $this->disclaimer,
            'guidance_text' => $this->guidanceText,
            'state' => $this->state->value,
            'revision' => $this->revision,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
            'retired_at' => $this->retiredAt?->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        $options = $row['option_codes'];
        if (is_string($options)) {
            $decoded = json_decode($options, true);
            $options = is_array($decoded) ? array_values($decoded) : null;
        }

        return new self(
            id: (string) $row['id'],
            code: (string) $row['code'],
            displayName: (string) $row['display_name'],
            dataType: AttributeType::from((string) $row['data_type']),
            unit: $row['unit'] === null ? null : (string) $row['unit'],
            optionCodes: $options === null ? null : array_values($options),
            lowerBound: $row['lower_bound'] === null ? null : (int) $row['lower_bound'],
            upperBound: $row['upper_bound'] === null ? null : (int) $row['upper_bound'],
            provenance: Provenance::from((string) $row['provenance']),
            disclaimer: $row['disclaimer'] === null ? null : (string) $row['disclaimer'],
            guidanceText: $row['guidance_text'] === null ? null : (string) $row['guidance_text'],
            state: AttributeState::from((string) $row['state']),
            revision: (int) $row['revision'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
            retiredAt: $row['retired_at'] === null ? null : new \DateTimeImmutable((string) $row['retired_at']),
        );
    }
}
