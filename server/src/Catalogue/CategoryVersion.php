<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * One frozen question set for a category: the attribute codes, types, units,
 * option lists and bounds copied into `bindings` at publish time.
 *
 * Immutable in the strong sense. There is no method that edits a binding; a
 * corrected vocabulary is a successor version with the next number. That is what
 * lets a pin keep pointing at the version a listing was created against while
 * the definition behind it is retired or renamed.
 */
final class CategoryVersion
{
    /** @var list<AttributeBinding> */
    public readonly array $bindings;

    /**
     * @param list<AttributeBinding> $bindings
     */
    private function __construct(
        public readonly string $id,
        public readonly string $categoryId,
        public readonly int $number,
        array $bindings,
        public readonly int $bindingCount,
        public readonly string $attributeDigest,
        public readonly \DateTimeImmutable $createdAt,
    ) {
        if ($this->id === '') {
            throw new InvalidCategory('A category version must have an id');
        }
        if ($this->categoryId === '') {
            throw new InvalidCategory('A category version must name its category');
        }
        if ($this->number < 1) {
            throw new InvalidCategory('A category version number starts at 1');
        }
        if ($this->bindingCount < 1) {
            throw new InvalidCategory('A category version must ask at least one question');
        }
        if ($this->bindingCount !== count($bindings)) {
            throw new InvalidCategory('binding_count must equal the number of frozen bindings');
        }
        if (preg_match('/^[0-9a-f]{64}$/', $this->attributeDigest) !== 1) {
            throw new InvalidCategory('The frozen vocabulary digest must be lowercase sha256 hex');
        }
        $this->bindings = $bindings;
    }

    /**
     * @param list<AttributeBinding> $bindings
     */
    public static function publish(
        string $id,
        string $categoryId,
        int $number,
        array $bindings,
        \DateTimeImmutable $createdAt,
    ): self {
        if ($bindings === []) {
            throw new InvalidCategory('A published category version must bind at least one attribute');
        }

        $codes = [];
        $ids = [];
        foreach ($bindings as $binding) {
            if (isset($codes[$binding->code])) {
                throw new InvalidCategory(sprintf(
                    'Binding "%s" appears twice in one version; a form cannot ask one question two ways',
                    $binding->code,
                ));
            }
            if (isset($ids[$binding->attributeId])) {
                throw new InvalidCategory(sprintf(
                    'Attribute id %s is bound twice in one version',
                    $binding->attributeId,
                ));
            }
            $codes[$binding->code] = true;
            $ids[$binding->attributeId] = true;
        }

        return new self(
            id: $id,
            categoryId: $categoryId,
            number: $number,
            bindings: $bindings,
            bindingCount: count($bindings),
            attributeDigest: self::digestBindings($bindings),
            createdAt: $createdAt,
        );
    }

    /**
     * The category-specific validation of a listing's attribute bag.
     *
     * Unknown keys, missing mandatory answers and values outside the frozen type
     * or option/bound set each raise their own exception. Nothing is coerced or
     * dropped.
     */
    public function validate(AttributeBag $bag): ValidatedAttributes
    {
        $byCode = [];
        foreach ($this->bindings as $binding) {
            $byCode[$binding->code] = $binding;
        }

        foreach ($bag->codes() as $code) {
            if (!isset($byCode[$code])) {
                throw new UnknownAttribute($code, $this->id);
            }
        }

        $validated = [];
        foreach ($this->bindings as $binding) {
            if (!$bag->has($binding->code)) {
                if ($binding->mandatory) {
                    throw new MissingRequiredAttribute($binding->code, $this->id);
                }

                continue;
            }
            $validated[$binding->code] = $binding->validateAnswer($bag->value($binding->code));
        }

        return ValidatedAttributes::canonicalise($validated);
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'category_id' => $this->categoryId,
            'number' => $this->number,
            'bindings' => array_map(
                static fn (AttributeBinding $binding): array => $binding->toArray(),
                $this->bindings,
            ),
            'binding_count' => $this->bindingCount,
            'attribute_digest' => $this->attributeDigest,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        $bindings = $row['bindings'];
        if (is_string($bindings)) {
            $decoded = json_decode($bindings, true);
            $bindings = is_array($decoded) ? $decoded : [];
        }

        return new self(
            id: (string) $row['id'],
            categoryId: (string) $row['category_id'],
            number: (int) $row['number'],
            bindings: array_map(
                static fn (array $binding): AttributeBinding => AttributeBinding::fromArray($binding),
                array_values($bindings),
            ),
            bindingCount: (int) $row['binding_count'],
            attributeDigest: (string) $row['attribute_digest'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
        );
    }

    public function binding(string $code): ?AttributeBinding
    {
        foreach ($this->bindings as $binding) {
            if ($binding->code === $code) {
                return $binding;
            }
        }

        return null;
    }

    /**
     * @param list<AttributeBinding> $bindings
     */
    private static function digestBindings(array $bindings): string
    {
        $canonical = array_map(
            static fn (AttributeBinding $binding): array => $binding->canonical(),
            $bindings,
        );
        usort(
            $canonical,
            static fn (array $a, array $b): int => strcmp((string) $a['code'], (string) $b['code']),
        );

        return hash('sha256', json_encode(
            $canonical,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
        ));
    }
}
