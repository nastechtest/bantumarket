<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * Catalogue's persistence port.
 *
 * One port rather than four repositories because a merge writes a pin, then a
 * category, in one transaction; splitting them would invite a caller to write
 * the category without the pins and strand a listing.
 */
interface CatalogueRepository
{
    public function insertCategory(Category $category): void;

    /**
     * @throws StaleCategoryVersion when the stored revision is not the expected one
     */
    public function saveCategory(Category $category, int $expectedRevision): void;

    public function findCategory(string $id): ?Category;

    public function findCategoryBySlug(string $slug): ?Category;

    /**
     * @return list<Category>
     */
    public function allCategories(): array;

    public function insertAttribute(AttributeDefinition $definition): void;

    public function findAttribute(string $id): ?AttributeDefinition;

    public function findAttributeByCode(string $code): ?AttributeDefinition;

    public function insertVersion(CategoryVersion $version): void;

    public function findVersion(string $id): ?CategoryVersion;

    /**
     * @return list<CategoryVersion> ascending number
     */
    public function versionsForCategory(string $categoryId): array;

    public function appendPin(ListingCategoryPin $pin): void;

    public function latestPin(string $listingId): ?ListingCategoryPin;

    /**
     * @return list<ListingCategoryPin> ascending number
     */
    public function pinsForListing(string $listingId): array;

    /**
     * The current claim of every listing that resolves to this category. This is
     * the set a merge must re-pin before the source can be decommissioned.
     *
     * @return list<ListingCategoryPin> one per listing, ordered by listing id
     */
    public function latestPinsForCategory(string $categoryId): array;

    /**
     * @return list<ListingCategoryPin>
     */
    public function allPins(): array;
}
