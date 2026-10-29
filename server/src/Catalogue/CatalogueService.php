<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Catalogue's public surface. The HTTP edge and the Listings module call these
 * methods; Application\Kernel wires the collaborators through Wiring.
 *
 * Two jobs, in this order of importance:
 *   1. validate a listing's attribute bag against the frozen vocabulary of a
 *      live category, refusing unknown keys, missing mandatory answers and
 *      values outside the allowed set without coercing anything;
 *   2. move a category's lifecycle (go live, rename, merge) without stranding
 *      the pins that already point at its versions.
 */
final class CatalogueService
{
    public function __construct(
        private readonly CatalogueRepository $repository,
        private readonly UnitOfWork $uow,
        private readonly Clock $clock,
    ) {
    }

    public function defineAttribute(AttributeDefinition $definition): AttributeDefinition
    {
        if ($this->repository->findAttributeByCode($definition->code) !== null) {
            throw new InvalidAttributeDefinition(sprintf(
                'Attribute code "%s" is already defined; a code names one question for the life of the platform',
                $definition->code,
            ));
        }

        $this->uow->begin();
        try {
            $this->repository->insertAttribute($definition);
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $definition;
    }

    /**
     * Create a DRAFT category. The hierarchy is one level deep at launch: a
     * category may have a root parent, and a root may not itself have a parent.
     */
    public function createCategory(string $slug, string $name, ?string $parentId = null): Category
    {
        if ($this->repository->findCategoryBySlug($slug) !== null) {
            throw new InvalidCategory(sprintf('Category slug "%s" is already in use', $slug));
        }

        if ($parentId !== null) {
            $parent = $this->requireCategory($parentId);
            if ($parent->parentId !== null) {
                throw new InvalidCategory('The category hierarchy is one level deep at launch; a child cannot be a parent');
            }
        }

        $category = Category::draft(
            Id::generate('cat')->value(),
            $slug,
            $name,
            $parentId,
            $this->clock->now(),
        );

        $this->uow->begin();
        try {
            $this->repository->insertCategory($category);
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $category;
    }

    /**
     * Rename a category. The current version, the successor pointer and every
     * listing pin stay exactly where they were: a pin is a claim against a
     * frozen version, not against the category's display text.
     */
    public function renameCategory(string $categoryId, string $name, ?string $slug = null): Category
    {
        $category = $this->requireCategory($categoryId);

        if ($slug !== null && $slug !== $category->slug) {
            $existing = $this->repository->findCategoryBySlug($slug);
            if ($existing !== null && $existing->id !== $category->id) {
                throw new InvalidCategory(sprintf('Category slug "%s" is already in use', $slug));
            }
        }

        $renamed = $category->rename($name, $slug);

        $this->uow->begin();
        try {
            $this->repository->saveCategory($renamed, $category->revision);
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $renamed;
    }

    /**
     * Freeze the named attribute definitions into the next immutable version of
     * a category. The version is not current until goLive() (or a caller that
     * already knows it is the successor's first version uses publishAndGoLive).
     *
     * @param list<string> $attributeCodes  in form order
     * @param list<string> $mandatoryCodes
     */
    public function publishVersion(
        string $categoryId,
        array $attributeCodes,
        array $mandatoryCodes = [],
        ?string $versionId = null,
    ): CategoryVersion {
        $category = $this->requireCategory($categoryId);
        if ($category->state->isDecommissioned()) {
            throw new InvalidCategory('A decommissioned category cannot publish a new version; publish on its successor');
        }
        if ($attributeCodes === []) {
            throw new InvalidCategory('A published version must bind at least one attribute');
        }
        foreach ($mandatoryCodes as $code) {
            if (!in_array($code, $attributeCodes, true)) {
                throw new InvalidAttributeDefinition(sprintf(
                    'Mandatory code "%s" is not bound by this version',
                    $code,
                ));
            }
        }

        $bindings = [];
        foreach (array_values($attributeCodes) as $order => $code) {
            $definition = $this->repository->findAttributeByCode($code);
            if ($definition === null) {
                throw new InvalidAttributeDefinition(sprintf(
                    'Attribute code "%s" is not defined; a version cannot bind a question with no rule behind it',
                    $code,
                ));
            }
            $bindings[] = AttributeBinding::fromDefinition(
                $definition,
                in_array($code, $mandatoryCodes, true),
                $order,
            );
        }

        $versions = $this->repository->versionsForCategory($categoryId);
        $number = $versions === [] ? 1 : ((int) $versions[count($versions) - 1]->number) + 1;
        $version = CategoryVersion::publish(
            $versionId ?? Id::generate('cver')->value(),
            $categoryId,
            $number,
            $bindings,
            $this->clock->now(),
        );

        $this->uow->begin();
        try {
            $this->repository->insertVersion($version);
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $version;
    }

    public function goLive(string $categoryId, string $versionId): Category
    {
        $category = $this->requireCategory($categoryId);
        $version = $this->repository->findVersion($versionId);
        if ($version === null || $version->categoryId !== $category->id) {
            throw new InvalidCategory(sprintf(
                'Version %s does not belong to category %s; a listing accepted here would be pinned to another category\'s claims',
                $versionId,
                $categoryId,
            ));
        }

        $live = $category->goLive($versionId);

        $this->uow->begin();
        try {
            $this->repository->saveCategory($live, $category->revision);
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $live;
    }

    /**
     * @param list<string> $attributeCodes
     * @param list<string> $mandatoryCodes
     * @return array{0: Category, 1: CategoryVersion}
     */
    public function publishAndGoLive(
        string $categoryId,
        array $attributeCodes,
        array $mandatoryCodes = [],
        ?string $versionId = null,
    ): array {
        $version = $this->publishVersion($categoryId, $attributeCodes, $mandatoryCodes, $versionId);
        $category = $this->goLive($categoryId, $version->id);

        return [$category, $version];
    }

    /**
     * Read-only validation: the entry point a listing form calls before it has a
     * listing id, and the one a merge uses to prove the successor's vocabulary
     * can carry the answers.
     *
     * @param array<array-key,mixed> $answers
     */
    public function validateListing(string $categoryId, array $answers): ValidatedAttributes
    {
        $category = $this->requireLiveCategory($categoryId);
        $version = $this->requireCurrentVersion($category);

        return $version->validate(AttributeBag::fromArray($answers));
    }

    /**
     * Validate a bag and append the listing's first pin.
     *
     * @param array<array-key,mixed> $answers
     */
    public function registerListing(string $listingId, string $categoryId, array $answers): ListingCategoryPin
    {
        $category = $this->requireLiveCategory($categoryId);
        $version = $this->requireCurrentVersion($category);
        $validated = $version->validate(AttributeBag::fromArray($answers));

        if ($this->repository->latestPin($listingId) !== null) {
            throw new CatalogueRefused(sprintf(
                'Listing %s already has a category claim; re-pin it instead of registering it twice',
                $listingId,
            ));
        }

        $pin = ListingCategoryPin::original(
            Id::generate('pin')->value(),
            $listingId,
            $category,
            $version,
            $validated->digest(),
            $this->clock->now(),
        );

        $this->uow->begin();
        try {
            $this->repository->appendPin($pin);
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $pin;
    }

    /**
     * Append the next claim for a listing that already exists.
     *
     * @param array<array-key,mixed> $answers
     */
    public function rePinListing(string $listingId, string $categoryId, array $answers): ListingCategoryPin
    {
        $category = $this->requireLiveCategory($categoryId);
        $version = $this->requireCurrentVersion($category);
        $validated = $version->validate(AttributeBag::fromArray($answers));
        $prior = $this->repository->latestPin($listingId);

        $pin = $prior === null
            ? ListingCategoryPin::original(
                Id::generate('pin')->value(),
                $listingId,
                $category,
                $version,
                $validated->digest(),
                $this->clock->now(),
            )
            : $prior->next(
                Id::generate('pin')->value(),
                $category,
                $version,
                $validated->digest(),
                $this->clock->now(),
            );

        $this->uow->begin();
        try {
            $this->repository->appendPin($pin);
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $pin;
    }

    /**
     * Merge a live category into a live successor.
     *
     * The rule the DDL expresses is the pre-flight here: no pin may still point
     * at a version of a category once that category is MERGED. Every listing's
     * current claim is therefore validated against the successor's frozen
     * vocabulary and a new pin is appended before the source row is touched. A
     * listing with no answers supplied refuses the whole merge rather than
     * becoming a forwarding pointer to a question it never answered.
     *
     * @param array<string, array<array-key,mixed>> $answersByListing
     */
    public function mergeCategory(
        string $sourceCategoryId,
        string $successorCategoryId,
        string $reason,
        array $answersByListing = [],
    ): Category {
        if (trim($reason) === '') {
            throw new CategoryMergeRefused('A merge states why it happened; an unnamed merge is an outage with no ticket');
        }
        if ($sourceCategoryId === $successorCategoryId) {
            throw new CategoryMergeRefused('A category cannot merge into itself; the forwarding pointer would never terminate');
        }

        $source = $this->requireCategory($sourceCategoryId);
        $successor = $this->requireCategory($successorCategoryId);
        if ($source->state !== CategoryState::Live) {
            throw new CategoryMergeRefused(sprintf(
                'Category %s is %s; only a LIVE category can be merged',
                $source->id,
                $source->state->value,
            ));
        }
        if ($successor->state !== CategoryState::Live) {
            throw new CategoryMergeRefused(sprintf(
                'Successor category %s is %s; a merge needs a live vocabulary to carry the listings',
                $successor->id,
                $successor->state->value,
            ));
        }
        $successorVersion = $this->requireCurrentVersion($successor);
        $pending = $this->repository->latestPinsForCategory($source->id);
        $now = $this->clock->now();

        $this->uow->begin();
        try {
            foreach ($pending as $pin) {
                if (!array_key_exists($pin->listingId, $answersByListing)
                    || !is_array($answersByListing[$pin->listingId])) {
                    throw new CategoryMergeRefused(sprintf(
                        'Listing %s is still pinned to %s. Supplying its answers is what re-pins it to %s; a merge that skips it strands the listing',
                        $pin->listingId,
                        $source->id,
                        $successor->id,
                    ));
                }

                try {
                    $validated = $successorVersion->validate(
                        AttributeBag::fromArray($answersByListing[$pin->listingId]),
                    );
                } catch (CatalogueRefused $refusal) {
                    throw new CategoryMergeRefused(sprintf(
                        'Listing %s cannot be carried from %s to %s: %s',
                        $pin->listingId,
                        $source->id,
                        $successor->id,
                        $refusal->getMessage(),
                    ));
                }

                $this->repository->appendPin($pin->next(
                    Id::generate('pin')->value(),
                    $successor,
                    $successorVersion,
                    $validated->digest(),
                    $now,
                ));
            }

            $merged = $source->mergedInto($successor->id, $reason, $now);
            $this->repository->saveCategory($merged, $source->revision);
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $merged;
    }

    /**
     * Follow a decommissioned category's forwarding pointer to the live category
     * a new listing should actually be pinned against. A cycle is refused: a
     * pointer that never terminates is the stranding case wearing a merge.
     */
    public function resolveCategory(string $categoryId): Category
    {
        $current = $this->requireCategory($categoryId);
        $seen = [];

        while ($current->state->isDecommissioned()) {
            if (isset($seen[$current->id])) {
                throw new InvalidCategory(sprintf(
                    'Category forwarding points form a cycle at %s; the listing at the end of it is stranded',
                    $current->id,
                ));
            }
            $seen[$current->id] = true;
            $successorId = $current->successorCategoryId;
            if ($successorId === null) {
                throw new InvalidCategory(sprintf(
                    'Category %s is %s with no successor',
                    $current->id,
                    $current->state->value,
                ));
            }
            $current = $this->requireCategory($successorId);
        }

        return $current;
    }

    public function categoryPath(string $categoryId): string
    {
        $segments = [];
        $seen = [];
        $current = $this->requireCategory($categoryId);

        while ($current !== null) {
            if (isset($seen[$current->id])) {
                throw new InvalidCategory('The category parent chain contains a cycle');
            }
            $seen[$current->id] = true;
            array_unshift($segments, $current->slug);
            $current = $current->parentId === null
                ? null
                : $this->requireCategory($current->parentId);
        }

        return implode('/', $segments);
    }

    public function category(string $categoryId): Category
    {
        return $this->requireCategory($categoryId);
    }

    public function currentVersion(string $categoryId): CategoryVersion
    {
        return $this->requireCurrentVersion($this->requireCategory($categoryId));
    }

    private function requireLiveCategory(string $categoryId): Category
    {
        $category = $this->resolveCategory($categoryId);
        if ($category->state !== CategoryState::Live) {
            throw new InvalidCategory(sprintf(
                'Category %s is %s and cannot accept listings',
                $category->id,
                $category->state->value,
            ));
        }

        return $category;
    }

    private function requireCategory(string $categoryId): Category
    {
        $category = $this->repository->findCategory($categoryId);
        if ($category === null) {
            throw new UnknownCategory($categoryId);
        }

        return $category;
    }

    private function requireCurrentVersion(Category $category): CategoryVersion
    {
        if ($category->currentVersionId === null) {
            throw new InvalidCategory(sprintf('Category %s has no current version', $category->id));
        }
        $version = $this->repository->findVersion($category->currentVersionId);
        if ($version === null || $version->categoryId !== $category->id) {
            throw new InvalidCategory(sprintf(
                'Category %s points at version %s, which is missing or belongs to another category',
                $category->id,
                $category->currentVersionId,
            ));
        }

        return $version;
    }
}
