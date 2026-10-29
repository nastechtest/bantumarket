<?php

declare(strict_types=1);

namespace NasTech\Tests\Search;

use NasTech\Search\Condition;
use NasTech\Search\InvalidSearchQuery;
use NasTech\Search\PriceBucket;
use NasTech\Search\SearchQuery;
use NasTech\Search\SortKey;
use NasTech\Search\UnknownSearchFilter;
use NasTech\Search\UnknownSortKey;
use NasTech\Tests\TestCase;

/**
 * The query model refuses what it does not understand.
 *
 * A buyer cannot distinguish "no results for the filter you chose" from "your
 * filter was dropped", and neither can the support agent reading the page. So
 * an unknown filter, an unknown sort, a facet value outside the enum or a
 * string where a boolean belongs is an error with a message that names the
 * closed vocabulary, not a best-effort answer.
 */
final class SearchQueryTest extends TestCase
{
    public function testAnUnknownFilterIsRefusedAndTheMessageListsTheRealOnes(): void
    {
        $thrown = $this->assertThrows(
            UnknownSearchFilter::class,
            fn () => SearchQuery::fromArray(['filters' => ['colour' => 'black']]),
            'colour',
        );

        $this->assertStringContains('price_bucket', $thrown->getMessage());
        $this->assertStringContains('category', $thrown->getMessage());
    }

    public function testAnUnknownSortIsRefusedRatherThanFallingBackToRelevance(): void
    {
        $thrown = $this->assertThrows(
            UnknownSortKey::class,
            fn () => SearchQuery::fromArray(['sort' => 'relevance_desc']),
            'relevance_desc',
        );

        $this->assertStringContains('recent', $thrown->getMessage());
        $this->assertStringContains('price_asc', $thrown->getMessage());
    }

    public function testAnUnknownTopLevelParameterIsRefused(): void
    {
        $this->assertThrows(
            InvalidSearchQuery::class,
            fn () => SearchQuery::fromArray(['page' => 2]),
            'Unknown search parameter "page"',
        );
    }

    public function testThePriceLadderMatchesTheContractAndEveryUpperBoundIsExclusive(): void
    {
        $this->assertSame([50_000, 100_000, 200_000, 270_000, 500_000, 1_000_000], PriceBucket::EDGES_CENTS);
        $this->assertSame(
            ['under_500', '500_1000', '1000_2000', '2000_2700', '2700_5000', '5000_10000', 'over_10000'],
            PriceBucket::values(),
        );

        $cases = [
            [0, 'under_500'],
            [49_999, 'under_500'],
            [50_000, '500_1000'],
            [99_999, '500_1000'],
            [100_000, '1000_2000'],
            [199_999, '1000_2000'],
            [200_000, '2000_2700'],
            [269_999, '2000_2700'],
            [270_000, '2700_5000'],
            [499_999, '2700_5000'],
            [500_000, '5000_10000'],
            [999_999, '5000_10000'],
            [1_000_000, 'over_10000'],
            [1_450_000, 'over_10000'],
        ];

        foreach ($cases as [$cents, $bucket]) {
            $this->assertSame($bucket, PriceBucket::fromCents($cents)->value, "price {$cents} falls in the wrong bucket");
        }
    }

    public function testTheContractBucketKeysAreAcceptedAsFilters(): void
    {
        foreach (PriceBucket::values() as $key) {
            $query = SearchQuery::fromArray(['filters' => ['price_bucket' => $key]]);
            $this->assertSame($key, $query->priceBucket?->value);
        }
    }

    public function testAnUnknownPriceBucketIsRefused(): void
    {
        $this->assertThrows(
            InvalidSearchQuery::class,
            fn () => SearchQuery::fromArray(['filters' => ['price_bucket' => 'cheap']]),
            'Unknown price bucket "cheap"',
        );
    }

    public function testAnUnknownConditionIsRefused(): void
    {
        $this->assertThrows(
            InvalidSearchQuery::class,
            fn () => SearchQuery::fromArray(['filters' => ['condition' => 'broken']]),
            'Unknown condition "broken"',
        );
        $this->assertThrows(
            InvalidSearchQuery::class,
            fn () => SearchQuery::fromArray(['filters' => ['condition' => 'mint', 'has3d' => 'true']]),
            'must be true or false',
        );
    }

    public function testOffsetAndLimitAreBoundedIntegers(): void
    {
        $this->assertThrows(InvalidSearchQuery::class, fn () => SearchQuery::fromArray(['limit' => 0]), 'limit');
        $this->assertThrows(InvalidSearchQuery::class, fn () => SearchQuery::fromArray(['limit' => 101]), 'limit');
        $this->assertThrows(InvalidSearchQuery::class, fn () => SearchQuery::fromArray(['limit' => '20']), 'limit');
        $this->assertThrows(InvalidSearchQuery::class, fn () => SearchQuery::fromArray(['offset' => -1]), 'offset');
    }

    public function testTermsAreLowercasedDeduplicatedAndBounded(): void
    {
        $query = SearchQuery::fromArray(['q' => ' Seiko   DIVER seiko ']);

        $this->assertSame(['seiko', 'diver'], $query->terms);
        $this->assertSame([], SearchQuery::fromArray([])->terms);
        $this->assertSame(SortKey::Relevance, $query->sort);
        $this->assertThrows(
            InvalidSearchQuery::class,
            fn () => SearchQuery::fromArray(['q' => 'a b c d e f g h i']),
            'at most 8',
        );
    }

    public function testAValidQueryEchoesTheMeaningItWillApply(): void
    {
        $query = SearchQuery::fromArray([
            'q' => 'Seiko diver',
            'filters' => [
                'category' => 'watches/pre-owned',
                'condition' => 'excellent',
                'has3d' => true,
                'price_bucket' => '2000_2700',
            ],
            'sort' => 'price_asc',
            'offset' => 5,
            'limit' => 10,
        ]);

        $this->assertSame(Condition::Excellent, $query->condition);
        $this->assertSame(true, $query->has3d);
        $this->assertSame(5, $query->offset);
        $this->assertSame(10, $query->limit);
        $this->assertSame([
            'q' => 'seiko diver',
            'filters' => [
                'category' => 'watches/pre-owned',
                'condition' => 'excellent',
                'has3d' => true,
                'price_bucket' => '2000_2700',
            ],
            'sort' => 'price_asc',
            'offset' => 5,
            'limit' => 10,
        ], $query->toArray());
    }
}
