<?php

declare(strict_types=1);

namespace NasTech\Tests\Catalogue;

use NasTech\Catalogue\AttributeDefinition;
use NasTech\Catalogue\AttributeType;
use NasTech\Catalogue\CatalogueRepository;
use NasTech\Catalogue\CatalogueService;
use NasTech\Catalogue\Category;
use NasTech\Catalogue\CategoryVersion;
use NasTech\Catalogue\ListingCategoryPin;
use NasTech\Catalogue\Provenance;
use NasTech\Catalogue\Wiring;
use NasTech\SharedKernel\FrozenClock;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\InMemoryUnitOfWork;

/**
 * The one fixture every Catalogue test builds on.
 *
 * It uses the module's own Schema, store, unit of work, repository, service and
 * clock, so a test cannot pass against a friendlier model than production. The
 * seeded vocabulary is the pilot's pre-owned watch category: case size, movement,
 * water resistance and a full-set boolean.
 */
final class CatalogueFixture
{
    public readonly InMemoryStore $store;
    public readonly InMemoryUnitOfWork $uow;
    public readonly FrozenClock $clock;
    public readonly CatalogueRepository $repository;
    public readonly CatalogueService $service;

    public readonly Category $root;
    public readonly Category $category;
    public readonly CategoryVersion $version;
    public readonly Category $successor;
    public readonly CategoryVersion $successorVersion;

    /** @var array<string, AttributeDefinition> */
    public readonly array $attributes;

    public function __construct()
    {
        $this->store = new InMemoryStore();
        Wiring::install($this->store);
        $this->clock = FrozenClock::at('2026-10-22T09:00:00+00:00');
        $this->uow = new InMemoryUnitOfWork($this->store);
        $this->repository = Wiring::repository($this->store);
        $this->service = Wiring::service($this->repository, $this->uow, $this->clock);

        $this->attributes = $this->defineAttributes();

        $this->root = $this->service->createCategory('watches', 'Watches');
        $mechanical = $this->service->createCategory(
            'watches_mechanical',
            'Mechanical watches',
            $this->root->id,
        );
        [$this->category, $this->version] = $this->service->publishAndGoLive(
            $mechanical->id,
            ['case_size', 'movement', 'water_resistance', 'full_set'],
            ['case_size', 'movement', 'water_resistance'],
            'cver_mechanical_1',
        );

        $automatic = $this->service->createCategory(
            'watches_automatic',
            'Automatic watches',
            $this->root->id,
        );
        [$this->successor, $this->successorVersion] = $this->service->publishAndGoLive(
            $automatic->id,
            ['case_size', 'movement', 'water_resistance', 'full_set'],
            ['case_size', 'movement', 'water_resistance'],
            'cver_automatic_1',
        );
    }

    /**
     * @return array<string, AttributeDefinition>
     */
    private function defineAttributes(): array
    {
        $disclaimer = 'As stated by the seller; not tested by NasTech.';
        $createdAt = $this->clock->now();

        $definitions = [
            AttributeDefinition::define(
                'attr_case_size',
                'case_size',
                'Case size',
                AttributeType::LengthMm,
                Provenance::StatedBySeller,
                $createdAt,
                unit: 'mm',
                disclaimer: $disclaimer,
            ),
            AttributeDefinition::define(
                'attr_movement',
                'movement',
                'Movement',
                AttributeType::Enum,
                Provenance::StatedBySeller,
                $createdAt,
                optionCodes: ['automatic', 'manual', 'quartz'],
                disclaimer: $disclaimer,
            ),
            AttributeDefinition::define(
                'attr_water_resistance',
                'water_resistance',
                'Water resistance',
                AttributeType::IntegerRange,
                Provenance::StatedBySeller,
                $createdAt,
                unit: 'bar',
                lowerBound: 0,
                upperBound: 30,
                disclaimer: $disclaimer,
                guidanceText: 'Use the rating on the caseback; do not guess.',
            ),
            AttributeDefinition::define(
                'attr_full_set',
                'full_set',
                'Full set',
                AttributeType::Boolean,
                Provenance::StatedBySeller,
                $createdAt,
                disclaimer: $disclaimer,
            ),
        ];

        $byCode = [];
        foreach ($definitions as $definition) {
            $this->service->defineAttribute($definition);
            $byCode[$definition->code] = $definition;
        }

        return $byCode;
    }

    /**
     * @return array<string,int|string|bool>
     */
    public function validAnswers(): array
    {
        return [
            'case_size' => 40,
            'movement' => 'automatic',
            'water_resistance' => 10,
            'full_set' => true,
        ];
    }

    /**
     * @param array<array-key,mixed>|null $answers
     */
    public function register(string $listingId, ?array $answers = null): ListingCategoryPin
    {
        return $this->service->registerListing(
            $listingId,
            $this->category->id,
            $answers ?? $this->validAnswers(),
        );
    }

    /**
     * The rows a real path wrote, for the DDL row-checks test.
     *
     * @return array<string, list<array<string,mixed>>>
     */
    public function rowsAfterMerge(string $listingId = 'lst_0001'): array
    {
        $this->register($listingId);
        $this->service->mergeCategory(
            $this->category->id,
            $this->successor->id,
            'Consolidated into automatic watches.',
            [$listingId => $this->validAnswers()],
        );

        $rows = [];
        foreach (array_keys(\NasTech\Catalogue\Schema::TABLES) as $table) {
            $rows[$table] = $this->store->all($table);
        }

        return $rows;
    }
}
