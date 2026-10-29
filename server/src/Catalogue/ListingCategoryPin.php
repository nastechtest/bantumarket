<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * One claim a listing made about itself, at a moment, against one frozen
 * vocabulary.
 *
 * Pins are append-only: an edit adds the next numbered pin rather than
 * overwriting the earlier claim. A merge therefore does not rewrite history; it
 * appends a new current pin against the successor's version, and the old pin
 * remains the answer to "what did this listing say in March".
 */
final class ListingCategoryPin
{
    public function __construct(
        public readonly string $id,
        public readonly string $listingId,
        public readonly int $number,
        public readonly string $categoryId,
        public readonly string $categoryVersionId,
        public readonly string $attributeDigest,
        public readonly string $answersDigest,
        public readonly ?string $priorPinId,
        public readonly \DateTimeImmutable $pinnedAt,
    ) {
        if ($this->id === '' || $this->listingId === '') {
            throw new CatalogueRefused('A pin names its id and the listing it belongs to');
        }
        if ($this->number < 1) {
            throw new CatalogueRefused('A pin number starts at 1');
        }
        if ($this->categoryId === $this->categoryVersionId) {
            throw new CatalogueRefused('A pin must name a category and a version, not the same string twice');
        }
        if (preg_match('/^[0-9a-f]{64}$/', $this->attributeDigest) !== 1) {
            throw new CatalogueRefused('A pin vocabulary digest must be lowercase sha256 hex');
        }
        if (preg_match('/^[0-9a-f]{64}$/', $this->answersDigest) !== 1) {
            throw new CatalogueRefused('A pin answers digest must be lowercase sha256 hex');
        }
        if ($this->attributeDigest === $this->answersDigest) {
            throw new CatalogueRefused('The vocabulary and answers digests must be two different facts');
        }
        if ($this->priorPinId !== null && $this->priorPinId === $this->id) {
            throw new CatalogueRefused('A re-pin cannot point at itself');
        }
    }

    public static function original(
        string $id,
        string $listingId,
        Category $category,
        CategoryVersion $version,
        string $answersDigest,
        \DateTimeImmutable $pinnedAt,
    ): self {
        if ($category->id !== $version->categoryId) {
            throw new CatalogueRefused('A pin must use a version of the category it names');
        }

        return new self(
            id: $id,
            listingId: $listingId,
            number: 1,
            categoryId: $category->id,
            categoryVersionId: $version->id,
            attributeDigest: $version->attributeDigest,
            answersDigest: $answersDigest,
            priorPinId: null,
            pinnedAt: $pinnedAt,
        );
    }

    public function next(
        string $id,
        Category $category,
        CategoryVersion $version,
        string $answersDigest,
        \DateTimeImmutable $pinnedAt,
    ): self {
        if ($category->id !== $version->categoryId) {
            throw new CatalogueRefused('A re-pin must use a version of the category it names');
        }

        return new self(
            id: $id,
            listingId: $this->listingId,
            number: $this->number + 1,
            categoryId: $category->id,
            categoryVersionId: $version->id,
            attributeDigest: $version->attributeDigest,
            answersDigest: $answersDigest,
            priorPinId: $this->id,
            pinnedAt: $pinnedAt,
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'listing_id' => $this->listingId,
            'number' => $this->number,
            'category_id' => $this->categoryId,
            'category_version_id' => $this->categoryVersionId,
            'attribute_digest' => $this->attributeDigest,
            'answers_digest' => $this->answersDigest,
            'prior_pin_id' => $this->priorPinId,
            'pinned_at' => $this->pinnedAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            listingId: (string) $row['listing_id'],
            number: (int) $row['number'],
            categoryId: (string) $row['category_id'],
            categoryVersionId: (string) $row['category_version_id'],
            attributeDigest: (string) $row['attribute_digest'],
            answersDigest: (string) $row['answers_digest'],
            priorPinId: $row['prior_pin_id'] === null ? null : (string) $row['prior_pin_id'],
            pinnedAt: new \DateTimeImmutable((string) $row['pinned_at']),
        );
    }
}
