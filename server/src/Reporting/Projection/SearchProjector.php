<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;
use NasTech\Reporting\EventType;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Search demand that found nothing.
 *
 * A zero-result query is the only direct evidence the catalogue is missing what
 * buyers asked for, so it is kept per query rather than pre-aggregated: a
 * category added next month must be able to answer questions about last month
 * without a backfill.
 */
final class SearchProjector implements Projector
{
    public function __construct(private readonly Store $store)
    {
    }

    public function supports(string $eventType): bool
    {
        return $eventType === EventType::SEARCH_PERFORMED;
    }

    public function project(EventEnvelope $event): void
    {
        $resultCount = $event->int('result_count');
        if ($resultCount < 0) {
            throw new \InvalidArgumentException('A search cannot return a negative number of results');
        }

        $this->store->insert('search_facts', [
            'id' => $event->string('query_id'),
            'query_id' => $event->string('query_id'),
            'category_id' => $event->string('category_id'),
            'result_count' => $resultCount,
            'occurred_at' => $event->occurredAt->format(\DateTimeInterface::ATOM),
            'ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
        ]);
    }
}
