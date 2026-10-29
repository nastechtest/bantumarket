<?php

declare(strict_types=1);

namespace NasTech\Tests\Search\Support;

use NasTech\Search\RebuildReport;
use NasTech\Search\Schema;
use NasTech\Search\SearchDocument;
use NasTech\Search\SearchIndex;
use NasTech\Search\Wiring;
use NasTech\SharedKernel\FrozenClock;
use NasTech\SharedKernel\Persistence\InMemoryStore;

/**
 * The one fixture every Search test builds on: the shipped schema lists, the
 * shipped Wiring and the in-memory Store, so a test cannot pass on a friendlier
 * model than production.
 *
 * The four listings are the whole pilot vocabulary — two divers, one digital,
 * one strap — with prices that sit on the interesting bucket edges (45 000 under
 * the R500 edge, 390 000 inside 2700_5000, 1 000 000 exactly on the
 * over_10000 edge).
 */
final class SearchFixture
{
    public readonly InMemoryStore $store;
    public readonly FrozenClock $clock;
    public readonly SearchIndex $index;

    public function __construct()
    {
        $this->store = new InMemoryStore();
        Schema::apply($this->store);
        $this->clock = FrozenClock::at('2026-11-02T09:00:00+00:00');
        $this->index = Wiring::index($this->store, $this->clock);
    }

    /**
     * @param array<string,mixed> $overrides
     * @return array<string,mixed>
     */
    public static function source(string $listingId, array $overrides = []): array
    {
        return array_merge([
            'listing_id' => $listingId,
            'title' => 'Seiko SKX007 diver',
            'category_path' => 'watches/pre-owned/divers',
            'price_cents' => 390_000,
            'condition' => 'excellent',
            'seller_tier' => 'T4',
            'has_photo' => true,
            'has_3d' => true,
            'has_video' => false,
            'active' => true,
            'published_at' => '2026-09-14T15:00:00+00:00',
            'source_version' => 3,
        ], $overrides);
    }

    public function indexAll(): RebuildReport
    {
        return $this->index->rebuild([
            SearchDocument::fromSource(self::source('lst_seiko')),
            SearchDocument::fromSource(self::source('lst_casio', [
                'title' => 'Casio F-91W digital',
                'category_path' => 'watches/pre-owned/digital',
                'price_cents' => 45_000,
                'condition' => 'good',
                'seller_tier' => 'T2',
                'has_photo' => true,
                'has_3d' => false,
                'published_at' => '2026-09-02T14:30:00+00:00',
                'source_version' => 2,
            ])),
            SearchDocument::fromSource(self::source('lst_omega', [
                'title' => 'Omega Seamaster quartz',
                'price_cents' => 1_000_000,
                'condition' => 'good',
                'seller_tier' => 'T5',
                'published_at' => '2026-10-19T09:30:00+00:00',
                'source_version' => 5,
            ])),
            SearchDocument::fromSource(self::source('lst_strap', [
                'title' => 'NATO strap, three sizes',
                'category_path' => 'watches/straps',
                'price_cents' => 21_000,
                'condition' => 'mint',
                'seller_tier' => 'T1',
                'has_photo' => true,
                'has_3d' => false,
                'published_at' => '2026-10-11T13:00:00+00:00',
                'source_version' => 1,
            ])),
        ]);
    }
}
