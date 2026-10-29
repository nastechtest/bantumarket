<?php

declare(strict_types=1);

namespace NasTech\Tests\Catalogue;

use NasTech\Catalogue\CategoryMergeRefused;
use NasTech\Catalogue\CategoryState;
use NasTech\Catalogue\InvalidAttributeValue;
use NasTech\Catalogue\MissingRequiredAttribute;
use NasTech\Catalogue\UnknownAttribute;
use NasTech\Catalogue\UnknownCategory;
use NasTech\Tests\TestCase;

/**
 * The vocabulary is closed and the lifecycle does not strand a listing.
 *
 * Each refusal test names the rule, not just the exception class: an unknown key,
 * a value outside the allowed set, a value of the wrong PHP type and a missing
 * mandatory answer are four different failures with four different fixes.
 */
final class CatalogueTest extends TestCase
{
    public function testAListingIsPinnedToTheVersionWhoseVocabularyItSatisfied(): void
    {
        $fx = new CatalogueFixture();

        $this->assertSame('watches/watches_mechanical', $fx->service->categoryPath($fx->category->id));

        $validated = $fx->service->validateListing($fx->category->id, $fx->validAnswers());
        $this->assertSame(40, $validated->all()['case_size']);
        $this->assertSame('automatic', $validated->all()['movement']);
        $this->assertSame(10, $validated->all()['water_resistance']);
        $this->assertSame(true, $validated->all()['full_set']);

        $pin = $fx->register('lst_0001');
        $this->assertSame(1, $pin->number);
        $this->assertSame('lst_0001', $pin->listingId);
        $this->assertSame($fx->category->id, $pin->categoryId);
        $this->assertSame($fx->version->id, $pin->categoryVersionId);
        $this->assertSame($fx->version->attributeDigest, $pin->attributeDigest);
        $this->assertSame(64, strlen($pin->answersDigest));
        $this->assertNotSame($pin->attributeDigest, $pin->answersDigest);
        $this->assertSame($pin->id, $fx->repository->latestPin('lst_0001')?->id);
    }

    public function testAnUnknownAttributeIsRefusedRatherThanDropped(): void
    {
        $fx = new CatalogueFixture();
        $answers = $fx->validAnswers();
        $answers['dial_colour'] = 'black';

        $this->assertThrows(
            UnknownAttribute::class,
            fn () => $fx->service->registerListing('lst_0001', $fx->category->id, $answers),
            'dial_colour',
        );
        $this->assertCount(0, $fx->repository->allPins(), 'a refused bag must not leave a partial pin');
    }

    public function testAValueOutsideTheAllowedSetIsRefused(): void
    {
        $fx = new CatalogueFixture();

        $badEnum = $fx->validAnswers();
        $badEnum['movement'] = 'smart';

        $this->assertThrows(
            InvalidAttributeValue::class,
            fn () => $fx->service->validateListing($fx->category->id, $badEnum),
            'not one of',
        );

        $tooMuchPressure = $fx->validAnswers();
        $tooMuchPressure['water_resistance'] = 45;

        $this->assertThrows(
            InvalidAttributeValue::class,
            fn () => $fx->service->validateListing($fx->category->id, $tooMuchPressure),
            'above the allowed upper bound',
        );
    }

    public function testAValueOfTheWrongTypeIsRefusedRatherThanCoerced(): void
    {
        $fx = new CatalogueFixture();

        $numericString = $fx->validAnswers();
        $numericString['case_size'] = '40';

        $this->assertThrows(
            InvalidAttributeValue::class,
            fn () => $fx->service->validateListing($fx->category->id, $numericString),
            'whole millimetres as an integer',
        );

        $truthy = $fx->validAnswers();
        $truthy['full_set'] = 1;

        $this->assertThrows(
            InvalidAttributeValue::class,
            fn () => $fx->service->validateListing($fx->category->id, $truthy),
            'a truthy value is not a boolean',
        );
    }

    public function testAMissingRequiredAttributeIsRefused(): void
    {
        $fx = new CatalogueFixture();
        $answers = $fx->validAnswers();
        unset($answers['movement']);

        $this->assertThrows(
            MissingRequiredAttribute::class,
            fn () => $fx->service->validateListing($fx->category->id, $answers),
            'movement',
        );
    }

    public function testAnUnknownCategoryIsRefusedBeforeAnyAttributeIsRead(): void
    {
        $fx = new CatalogueFixture();

        $this->assertThrows(
            UnknownCategory::class,
            fn () => $fx->service->validateListing('cat_does_not_exist', $fx->validAnswers()),
            'cat_does_not_exist',
        );
    }

    public function testAMergeWithoutSuccessorAnswersIsRefusedAndStrandsNothing(): void
    {
        $fx = new CatalogueFixture();
        $pin = $fx->register('lst_0001');

        $this->assertThrows(
            CategoryMergeRefused::class,
            fn () => $fx->service->mergeCategory(
                $fx->category->id,
                $fx->successor->id,
                'Consolidated into automatic watches.',
            ),
            'lst_0001',
        );

        $reloaded = $fx->service->category($fx->category->id);
        $this->assertSame(CategoryState::Live, $reloaded->state);
        $this->assertSame($fx->category->id, $fx->service->resolveCategory($fx->category->id)->id);
        $this->assertCount(1, $fx->repository->pinsForListing('lst_0001'));
        $this->assertSame($pin->id, $fx->repository->latestPin('lst_0001')?->id);
    }

    public function testAMergeRepinsEveryListingAndForwardsTheOldCategory(): void
    {
        $fx = new CatalogueFixture();
        $original = $fx->register('lst_0001');

        $merged = $fx->service->mergeCategory(
            $fx->category->id,
            $fx->successor->id,
            'Consolidated into automatic watches.',
            ['lst_0001' => $fx->validAnswers()],
        );

        $this->assertSame(CategoryState::Merged, $merged->state);
        $this->assertSame($fx->successor->id, $merged->successorCategoryId);
        $this->assertSame('Consolidated into automatic watches.', $merged->retirementReason);
        $this->assertSame($fx->successor->id, $fx->service->resolveCategory($fx->category->id)->id);

        $pins = $fx->repository->pinsForListing('lst_0001');
        $this->assertCount(2, $pins);
        $this->assertSame($original->id, $pins[0]->id, 'the historical claim is kept');
        $this->assertSame($fx->category->id, $pins[0]->categoryId);

        $current = $pins[1];
        $this->assertSame(2, $current->number);
        $this->assertSame($fx->successor->id, $current->categoryId);
        $this->assertSame($fx->successorVersion->id, $current->categoryVersionId);
        $this->assertSame($original->id, $current->priorPinId);
        $this->assertSame($fx->successorVersion->attributeDigest, $current->attributeDigest);
        $this->assertSame($current->id, $fx->repository->latestPin('lst_0001')?->id);
    }

    public function testRenamingACategoryLeavesEveryPinAndVersionUntouched(): void
    {
        $fx = new CatalogueFixture();
        $pin = $fx->register('lst_0001');
        $pinsBefore = array_map(
            static fn ($existing): array => $existing->toRow(),
            $fx->repository->allPins(),
        );

        $renamed = $fx->service->renameCategory(
            $fx->category->id,
            'Mechanical wristwatches',
            'watches_mechanical_v2',
        );

        $this->assertSame('Mechanical wristwatches', $renamed->name);
        $this->assertSame('watches_mechanical_v2', $renamed->slug);
        $this->assertSame($fx->category->revision + 1, $renamed->revision);
        $this->assertSame($fx->version->id, $renamed->currentVersionId);
        $this->assertSame(CategoryState::Live, $renamed->state);

        $pinsAfter = array_map(
            static fn ($existing): array => $existing->toRow(),
            $fx->repository->allPins(),
        );
        $this->assertSame($pinsBefore, $pinsAfter, 'a rename must not move a pin');
        $this->assertSame($pin->id, $fx->repository->latestPin('lst_0001')?->id);

        $this->assertSame(
            'watches/watches_mechanical_v2',
            $fx->service->categoryPath($fx->category->id),
        );
        $this->assertSame(
            40,
            $fx->service->validateListing($fx->category->id, $fx->validAnswers())->all()['case_size'],
        );
    }

    public function testAFailedMergeRollsBackInsteadOfHalfMovingPins(): void
    {
        $fx = new CatalogueFixture();
        $fx->register('lst_a');
        $fx->register('lst_b');
        $pinsBefore = $fx->repository->allPins();

        $this->assertThrows(
            CategoryMergeRefused::class,
            fn () => $fx->service->mergeCategory(
                $fx->category->id,
                $fx->successor->id,
                'Consolidated into automatic watches.',
                ['lst_a' => $fx->validAnswers()],
            ),
            'lst_b',
        );

        $this->assertCount(2, $fx->repository->allPins(), 'the first re-pin must be rolled back with the failure');
        $this->assertSame(
            $fx->category->id,
            $fx->repository->latestPin('lst_a')?->categoryId,
        );
        $this->assertSame(
            $fx->category->id,
            $fx->repository->latestPin('lst_b')?->categoryId,
        );
        $this->assertSame(CategoryState::Live, $fx->service->category($fx->category->id)->state);
        $this->assertCount(2, $pinsBefore);
    }
}
