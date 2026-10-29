<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

use NasTech\SharedKernel\Persistence\Store;

/**
 * The in-memory model of the database the tests run against.
 *
 * It enforces category revision monotonicity in the same place the DDL trigger
 * does, and it only ever appends a pin. The SQL schema applies the append-only
 * trigger on category_versions; this repository simply never calls update on it.
 */
final class InMemoryCatalogueRepository implements CatalogueRepository
{
    private const CATEGORIES = 'catalogue_categories';
    private const ATTRIBUTES = 'catalogue_attribute_definitions';
    private const VERSIONS = 'catalogue_category_versions';
    private const PINS = 'catalogue_listing_category_pins';

    public function __construct(private readonly Store $store)
    {
    }

    public function insertCategory(Category $category): void
    {
        $this->store->insert(self::CATEGORIES, $category->toRow());
    }

    public function saveCategory(Category $category, int $expectedRevision): void
    {
        $stored = $this->store->find(self::CATEGORIES, $category->id);
        if ($stored === null) {
            throw new UnknownCategory($category->id);
        }
        $storedRevision = (int) $stored['revision'];
        if ($storedRevision !== $expectedRevision) {
            throw new StaleCategoryVersion($category->id, $expectedRevision, $storedRevision);
        }
        if ($category->revision <= $storedRevision) {
            throw new InvalidCategory(sprintf(
                'Category %s saved at revision %d, which does not advance the stored revision %d',
                $category->id,
                $category->revision,
                $storedRevision,
            ));
        }
        $this->store->update(self::CATEGORIES, $category->toRow());
    }

    public function findCategory(string $id): ?Category
    {
        $row = $this->store->find(self::CATEGORIES, $id);

        return $row === null ? null : Category::fromRow($row);
    }

    public function findCategoryBySlug(string $slug): ?Category
    {
        foreach ($this->store->all(self::CATEGORIES) as $row) {
            if ((string) $row['slug'] === $slug) {
                return Category::fromRow($row);
            }
        }

        return null;
    }

    public function allCategories(): array
    {
        $rows = $this->store->all(self::CATEGORIES);
        usort($rows, static fn (array $a, array $b): int => strcmp((string) $a['slug'], (string) $b['slug']));

        return array_map(static fn (array $row): Category => Category::fromRow($row), $rows);
    }

    public function insertAttribute(AttributeDefinition $definition): void
    {
        $this->store->insert(self::ATTRIBUTES, $definition->toRow());
    }

    public function findAttribute(string $id): ?AttributeDefinition
    {
        $row = $this->store->find(self::ATTRIBUTES, $id);

        return $row === null ? null : AttributeDefinition::fromRow($row);
    }

    public function findAttributeByCode(string $code): ?AttributeDefinition
    {
        foreach ($this->store->all(self::ATTRIBUTES) as $row) {
            if ((string) $row['code'] === $code) {
                return AttributeDefinition::fromRow($row);
            }
        }

        return null;
    }

    public function insertVersion(CategoryVersion $version): void
    {
        $this->store->insert(self::VERSIONS, $version->toRow());
    }

    public function findVersion(string $id): ?CategoryVersion
    {
        $row = $this->store->find(self::VERSIONS, $id);

        return $row === null ? null : CategoryVersion::fromRow($row);
    }

    public function versionsForCategory(string $categoryId): array
    {
        $rows = array_values(array_filter(
            $this->store->all(self::VERSIONS),
            static fn (array $row): bool => (string) $row['category_id'] === $categoryId,
        ));
        usort($rows, static fn (array $a, array $b): int => (int) $a['number'] <=> (int) $b['number']);

        return array_map(static fn (array $row): CategoryVersion => CategoryVersion::fromRow($row), $rows);
    }

    public function appendPin(ListingCategoryPin $pin): void
    {
        $this->store->insert(self::PINS, $pin->toRow());
    }

    public function latestPin(string $listingId): ?ListingCategoryPin
    {
        $pins = $this->pinsForListing($listingId);

        return $pins === [] ? null : $pins[count($pins) - 1];
    }

    public function pinsForListing(string $listingId): array
    {
        $rows = array_values(array_filter(
            $this->store->all(self::PINS),
            static fn (array $row): bool => (string) $row['listing_id'] === $listingId,
        ));
        usort($rows, static fn (array $a, array $b): int => (int) $a['number'] <=> (int) $b['number']);

        return array_map(static fn (array $row): ListingCategoryPin => ListingCategoryPin::fromRow($row), $rows);
    }

    public function latestPinsForCategory(string $categoryId): array
    {
        $latest = [];
        foreach ($this->allPins() as $pin) {
            $current = $latest[$pin->listingId] ?? null;
            if ($current === null || $pin->number > $current->number) {
                $latest[$pin->listingId] = $pin;
            }
        }

        $pending = array_values(array_filter(
            $latest,
            static fn (ListingCategoryPin $pin): bool => $pin->categoryId === $categoryId,
        ));
        usort($pending, static fn (ListingCategoryPin $a, ListingCategoryPin $b): int => strcmp($a->listingId, $b->listingId));

        return $pending;
    }

    public function allPins(): array
    {
        $rows = $this->store->all(self::PINS);
        usort($rows, static function (array $a, array $b): int {
            return strcmp((string) $a['listing_id'], (string) $b['listing_id'])
                ?: ((int) $a['number'] <=> (int) $b['number']);
        });

        return array_map(static fn (array $row): ListingCategoryPin => ListingCategoryPin::fromRow($row), $rows);
    }
}
