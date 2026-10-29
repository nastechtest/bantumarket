<?php

declare(strict_types=1);

namespace NasTech\Tests\Search;

use NasTech\Search\InMemorySearchIndex;
use NasTech\Search\PersonalDataRefused;
use NasTech\Search\SearchDocument;
use NasTech\Search\SearchIndex;
use NasTech\Search\SearchProjectionRefused;
use NasTech\Search\SearchQuery;
use NasTech\Search\SortKey;
use NasTech\Search\StaleIndexWrite;
use NasTech\Search\VersionReused;
use NasTech\Tests\Search\Support\SearchFixture;
use NasTech\Tests\TestCase;

/**
 * The index is a projection: rebuildable, versioned and incapable of holding a
 * person.
 *
 * The positive path (four listings, one page) is the easy half. These tests are
 * mostly negative because the failures are quiet: a second rebuild that rewrites
 * dates, a replayed event that rolls a listing back, a version number that means
 * two things, or a seller's phone number arriving through an allowed column.
 */
final class SearchIndexTest extends TestCase
{
    public function testARebuildIsIdempotentAndTheSecondRunWritesNothing(): void
    {
        $fx = new SearchFixture();

        $first = $fx->indexAll();
        $rowsAfterFirst = $fx->store->all('search_documents');

        $second = $fx->indexAll();
        $rowsAfterSecond = $fx->store->all('search_documents');

        $this->assertSame(4, $first->scanned);
        $this->assertSame(4, $first->indexed, 'a fresh rebuild must write every document');
        $this->assertSame(0, $first->unchanged);
        $this->assertSame(0, $second->indexed, 'the same source versions must write nothing');
        $this->assertSame(4, $second->unchanged);
        $this->assertSame($rowsAfterFirst, $rowsAfterSecond, 'idempotent means byte-identical rows, not merely the same ids');
    }

    public function testAStaleDocumentIsDetectedAgainstTheSourceVersion(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $this->assertSame(
            ['lst_seiko', 'lst_strap'],
            $fx->index->staleAgainst([
                'lst_seiko' => 4,
                'lst_casio' => 2,
                'lst_omega' => 5,
                'lst_strap' => 2,
            ]),
        );
        $this->assertSame([], $fx->index->staleAgainst(['lst_seiko' => 3]), 'an equal version is current, not stale');
        $this->assertSame([], $fx->index->staleAgainst(['lst_absent' => 9]), 'an unindexed listing is not a stale row');
    }

    public function testAnOlderSourceVersionCannotOverwriteANewerRow(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $this->assertThrows(
            StaleIndexWrite::class,
            fn () => $fx->index->index(SearchDocument::fromSource(
                SearchFixture::source('lst_seiko', ['source_version' => 2]),
            )),
            'older',
        );
        $this->assertSame(3, $fx->index->document('lst_seiko')?->sourceVersion, 'the newer row must survive');
    }

    public function testOneSourceVersionCannotDescribeTwoDifferentRows(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $this->assertThrows(
            VersionReused::class,
            fn () => $fx->index->index(SearchDocument::fromSource(
                SearchFixture::source('lst_seiko', ['title' => 'Seiko SKX007 diver, new bezel']),
            )),
            'version 3',
        );
    }

    public function testTheSameVersionAndContentIsANoOp(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $this->assertSame(
            SearchIndex::UNCHANGED,
            $fx->index->index(SearchDocument::fromSource(SearchFixture::source('lst_seiko'))),
        );
    }

    public function testANewerSourceVersionReplacesTheRowAndItsOldTextDisappears(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $status = $fx->index->index(SearchDocument::fromSource(SearchFixture::source('lst_seiko', [
            'title' => 'Seiko 5 Sports, serviced',
            'source_version' => 4,
        ])));

        $this->assertSame(SearchIndex::INDEXED, $status);
        $this->assertSame(4, $fx->index->document('lst_seiko')?->sourceVersion);
        $this->assertSame([], $fx->index->staleAgainst(['lst_seiko' => 4]));
        $this->assertSame(0, $fx->index->search(SearchQuery::fromArray(['q' => 'skx007']))->total, 'the old title must not linger');
        $this->assertSame(1, $fx->index->search(SearchQuery::fromArray(['q' => 'serviced']))->total);
    }

    public function testASourceVersionBelowOneIsRefusedAtTheProjectionBoundary(): void
    {
        $this->assertThrows(
            SearchProjectionRefused::class,
            fn () => SearchDocument::fromSource(SearchFixture::source('lst_zero', ['source_version' => 0])),
            'starts at 1',
        );
    }

    public function testTheProjectionRefusesEveryPersonalFieldByName(): void
    {
        foreach (SearchDocument::PERSONAL_FIELDS as $field) {
            $this->assertThrows(
                PersonalDataRefused::class,
                fn () => SearchDocument::fromSource(SearchFixture::source('lst_personal', [$field => 'anything'])),
                $field,
            );
        }
    }

    public function testAProjectionFieldOutsideTheClosedListIsRefusedRatherThanDropped(): void
    {
        $this->assertThrows(
            SearchProjectionRefused::class,
            fn () => SearchDocument::fromSource(SearchFixture::source('lst_extra', ['colour' => 'black'])),
            'colour',
        );
    }

    public function testATitleCarryingAContactDetailIsRefusedBeforeItIsIndexed(): void
    {
        $this->assertThrows(
            PersonalDataRefused::class,
            fn () => SearchDocument::fromSource(SearchFixture::source('lst_phone', [
                'title' => 'Seiko diver, call 082 123 4567',
            ])),
            'phone number',
        );

        $this->assertThrows(
            PersonalDataRefused::class,
            fn () => SearchDocument::fromSource(SearchFixture::source('lst_email', [
                'title' => 'Seiko diver, mail seller@example.co.za',
            ])),
            'email address',
        );
    }

    public function testExplainNamesTheTermAndEveryFilterThatLetTheRowThrough(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $explanations = $fx->index->explain(SearchQuery::fromArray([
            'q' => 'seiko',
            'filters' => [
                'condition' => 'excellent',
                'has3d' => true,
                'price_bucket' => '2700_5000',
            ],
        ]));

        $this->assertCount(1, $explanations);
        $explanation = $explanations[0];
        $this->assertSame('lst_seiko', $explanation->listingId);
        $this->assertSame('title', $explanation->matchedTerms['seiko']);
        $this->assertSame(['condition', 'has3d', 'price_bucket'], array_keys($explanation->matchedFilters));
        $this->assertStringContains('2700_5000', $explanation->matchedFilters['price_bucket']);
        $this->assertSame(130, $explanation->score, 'one term (100) plus three filters (3 x 10)');
        $this->assertSame(SortKey::Relevance, $explanation->sort);
    }

    public function testAWordThatDoesNotMatchExcludesTheRowAndExplainSaysNothing(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $query = SearchQuery::fromArray(['q' => 'seiko', 'filters' => ['condition' => 'good']]);

        $this->assertSame([], $fx->index->explain($query));
        $this->assertSame(0, $fx->index->search($query)->total);
    }

    public function testExplainIgnoresThePageWindowWhileSearchHonoursIt(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $query = SearchQuery::fromArray(['limit' => 1]);

        $this->assertCount(4, $fx->index->explain($query), 'explain is a debug view, not a page');
        $this->assertCount(1, $fx->index->search($query)->hits);
    }

    public function testOffsetLimitAndTotalDescribeTheWholeMatchSet(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $page = $fx->index->search(SearchQuery::fromArray([
            'sort' => 'price_asc',
            'offset' => 1,
            'limit' => 2,
        ]));

        $this->assertSame(4, $page->total, 'the total is before the window');
        $this->assertSame(1, $page->offset);
        $this->assertSame(2, $page->limit);
        $this->assertCount(2, $page->hits);
        $this->assertSame(45_000, $page->hits[0]->document->priceCents);
        $this->assertSame(390_000, $page->hits[1]->document->priceCents);
    }

    public function testACategoryFilterMatchesWholeSegmentsOnly(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $this->assertSame(3, $fx->index->search(SearchQuery::fromArray([
            'filters' => ['category' => 'watches/pre-owned'],
        ]))->total);
        $this->assertSame(0, $fx->index->search(SearchQuery::fromArray([
            'filters' => ['category' => 'watch'],
        ]))->total, '"watch" must not match "watches" by string prefix');
    }

    public function testAnInactiveDocumentIsRetainedButNeverReturned(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $fx->index->index(SearchDocument::fromSource(SearchFixture::source('lst_old', [
            'title' => 'Retired Seiko diver',
            'active' => false,
            'has_3d' => false,
            'price_cents' => 150_000,
            'condition' => 'worn',
            'seller_tier' => 'T1',
            'published_at' => '2026-08-01T08:00:00+00:00',
            'source_version' => 2,
        ])));

        $this->assertSame(0, $fx->index->search(SearchQuery::fromArray(['q' => 'retired']))->total);
        $this->assertNotSame(null, $fx->index->document('lst_old'), 'the row is kept as evidence that it was seen');
    }

    public function testAResultTileCarriesNoPersonalColumnAtAll(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $hit = $fx->index->search(SearchQuery::fromArray(['limit' => 1]))->hits[0];
        $tile = $hit->toArray();

        foreach (SearchDocument::PERSONAL_FIELDS as $field) {
            $this->assertFalse(array_key_exists($field, $tile), "a result tile must not expose {$field}");
        }
        $this->assertSame('lst_omega', $hit->document->listingId, 'relevance order falls back to newest first');
    }

    public function testTwoIdenticalQueriesAnswerIdenticallyBecauseRankingTakesNoIdentity(): void
    {
        $fx = new SearchFixture();
        $fx->indexAll();

        $query = SearchQuery::fromArray(['sort' => 'relevance']);
        $first = array_map(static fn ($hit): string => $hit->document->listingId, $fx->index->search($query)->hits);
        $second = array_map(static fn ($hit): string => $hit->document->listingId, $fx->index->search($query)->hits);

        $this->assertSame($first, $second);
        $this->assertSame(['lst_omega', 'lst_strap', 'lst_seiko', 'lst_casio'], $first);
    }
}
