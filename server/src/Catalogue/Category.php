<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * The mutable half of the taxonomy: a category is a lifecycle that points at
 * whichever immutable version new listings are accepted against.
 *
 * The aggregate is immutable value-style: a lifecycle move returns a new row
 * with a higher revision, which is what the DDL's revision-monotonic trigger
 * polices. Renaming changes the label and slug only; every pin already made
 * keeps pointing at the version it was made against, so a rename cannot orphan
 * a listing.
 */
final class Category
{
    public const SLUG_PATTERN = '/^[a-z][a-z0-9_]{1,40}$/';

    public function __construct(
        public readonly string $id,
        public readonly string $slug,
        public readonly string $name,
        public readonly ?string $parentId,
        public readonly CategoryState $state,
        public readonly ?string $currentVersionId,
        public readonly ?string $successorCategoryId,
        public readonly ?string $retirementReason,
        public readonly int $revision,
        public readonly \DateTimeImmutable $createdAt,
        public readonly ?\DateTimeImmutable $retiredAt,
    ) {
        if ($this->id === '') {
            throw new InvalidCategory('A category must have an id');
        }
        if (preg_match(self::SLUG_PATTERN, $this->slug) !== 1) {
            throw new InvalidCategory(sprintf(
                'Category slug "%s" must be lowercase, start with a letter and use underscores; the DDL pattern is %s',
                $this->slug,
                self::SLUG_PATTERN,
            ));
        }
        if (trim($this->name) === '') {
            throw new InvalidCategory('A category name cannot be blank');
        }
        if ($this->parentId !== null && $this->parentId === $this->id) {
            throw new InvalidCategory('A category cannot be its own parent');
        }
        if ($this->successorCategoryId !== null && $this->successorCategoryId === $this->id) {
            throw new InvalidCategory('A category cannot be its own successor; the forwarding pointer would never terminate');
        }
        if ($this->state !== CategoryState::Draft && $this->currentVersionId === null) {
            throw new InvalidCategory(sprintf(
                'Category %s is %s but has no current version; only a DRAFT may lack a published vocabulary',
                $this->id,
                $this->state->value,
            ));
        }
        if ($this->state->isDecommissioned()) {
            if ($this->successorCategoryId === null) {
                throw new InvalidCategory(sprintf(
                    'Category %s is %s without a successor; its listings would be stranded',
                    $this->id,
                    $this->state->value,
                ));
            }
            if ($this->retirementReason === null || trim($this->retirementReason) === '') {
                throw new InvalidCategory('A decommissioned category must state why it was closed');
            }
        }
        if ($this->revision < 1) {
            throw new InvalidCategory('A category revision starts at 1');
        }
    }

    public static function draft(
        string $id,
        string $slug,
        string $name,
        ?string $parentId,
        \DateTimeImmutable $createdAt,
    ): self {
        return new self(
            id: $id,
            slug: $slug,
            name: trim($name),
            parentId: $parentId,
            state: CategoryState::Draft,
            currentVersionId: null,
            successorCategoryId: null,
            retirementReason: null,
            revision: 1,
            createdAt: $createdAt,
            retiredAt: null,
        );
    }

    public function goLive(string $versionId): self
    {
        if ($this->state !== CategoryState::Draft) {
            throw new InvalidCategory('Only a DRAFT category can go live');
        }

        return $this->with(
            state: CategoryState::Live,
            currentVersionId: $versionId,
        );
    }

    /**
     * A label/slug change. The version pointer, successor pointer and every pin
     * stay exactly as they were: a pin is a claim against a version, not against
     * the category's display text.
     */
    public function rename(string $name, ?string $slug = null): self
    {
        if ($this->state === CategoryState::Merged) {
            throw new InvalidCategory('A MERGED category is a forwarding pointer; rename the successor instead');
        }

        return new self(
            id: $this->id,
            slug: $slug ?? $this->slug,
            name: trim($name),
            parentId: $this->parentId,
            state: $this->state,
            currentVersionId: $this->currentVersionId,
            successorCategoryId: $this->successorCategoryId,
            retirementReason: $this->retirementReason,
            revision: $this->revision + 1,
            createdAt: $this->createdAt,
            retiredAt: $this->retiredAt,
        );
    }

    public function mergedInto(string $successorId, string $reason, \DateTimeImmutable $at): self
    {
        if ($this->state !== CategoryState::Live) {
            throw new InvalidCategory('Only a LIVE category can be merged');
        }
        if ($successorId === $this->id) {
            throw new InvalidCategory('A category cannot merge into itself');
        }

        return new self(
            id: $this->id,
            slug: $this->slug,
            name: $this->name,
            parentId: $this->parentId,
            state: CategoryState::Merged,
            currentVersionId: $this->currentVersionId,
            successorCategoryId: $successorId,
            retirementReason: $reason,
            revision: $this->revision + 1,
            createdAt: $this->createdAt,
            retiredAt: $at,
        );
    }

    public function path(?self $parent): string
    {
        return $parent === null ? $this->slug : $parent->slug . '/' . $this->slug;
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'name' => $this->name,
            'parent_id' => $this->parentId,
            'state' => $this->state->value,
            'current_version_id' => $this->currentVersionId,
            'successor_category_id' => $this->successorCategoryId,
            'retirement_reason' => $this->retirementReason,
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
        return new self(
            id: (string) $row['id'],
            slug: (string) $row['slug'],
            name: (string) $row['name'],
            parentId: $row['parent_id'] === null ? null : (string) $row['parent_id'],
            state: CategoryState::from((string) $row['state']),
            currentVersionId: $row['current_version_id'] === null ? null : (string) $row['current_version_id'],
            successorCategoryId: $row['successor_category_id'] === null ? null : (string) $row['successor_category_id'],
            retirementReason: $row['retirement_reason'] === null ? null : (string) $row['retirement_reason'],
            revision: (int) $row['revision'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
            retiredAt: $row['retired_at'] === null ? null : new \DateTimeImmutable((string) $row['retired_at']),
        );
    }

    private function with(CategoryState $state, string $currentVersionId): self
    {
        return new self(
            id: $this->id,
            slug: $this->slug,
            name: $this->name,
            parentId: $this->parentId,
            state: $state,
            currentVersionId: $currentVersionId,
            successorCategoryId: $this->successorCategoryId,
            retirementReason: $this->retirementReason,
            revision: $this->revision + 1,
            createdAt: $this->createdAt,
            retiredAt: $this->retiredAt,
        );
    }
}
