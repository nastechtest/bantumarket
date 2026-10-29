<?php

declare(strict_types=1);

namespace NasTech\Search;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Static factories for the composition root. Wiring decides construction order,
 * never a rule.
 *
 * Search depends on no module class here. Its only input is a SearchDocument
 * snapshot built by the adapter; the listing id is an opaque string. That is why
 * the module can be rebuilt from the source without loading another module's
 * aggregate, and why it stays usable while the Catalogue module is in flight.
 */
final class Wiring
{
    public static function index(Store $store, Clock $clock): SearchIndex
    {
        return new InMemorySearchIndex($store, $clock);
    }

    /**
     * @param array<string,mixed> $input
     */
    public static function query(array $input): SearchQuery
    {
        return SearchQuery::fromArray($input);
    }

    /**
     * The facets a caller may offer, in ladder order.
     *
     * @return list<string>
     */
    public static function priceBuckets(): array
    {
        return PriceBucket::values();
    }

    /**
     * Apply Search's storage constraints to a store. The migration applies the
     * same lists as DDL; SearchDdlTest compares them.
     */
    public static function install(Store $store): void
    {
        if ($store instanceof InMemoryStore) {
            Schema::apply($store);
        }
    }

    private function __construct()
    {
    }
}
