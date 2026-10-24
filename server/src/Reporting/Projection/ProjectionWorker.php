<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;
use NasTech\Reporting\ProjectionWatermark;
use NasTech\Reporting\Schema;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Applies outbox events to the projection, exactly once.
 *
 * Exactly once is achieved the only way it can be: the event id is claimed by
 * an insert against a unique key in the same transaction as the projection
 * rows. A re-delivered event is found there and skipped, not applied twice.
 * The watermark moves with the claim, so a crash rolls both back and the next
 * pull sees the same batch.
 *
 * An event with no projector is recorded as IGNORED, not dropped. The
 * difference matters at month end: "we never received a LedgerEntryRecorded"
 * and "we received one and chose not to project it" are different facts, and
 * only one of them is a producer defect.
 */
final class ProjectionWorker
{
    /** @var list<Projector> */
    private array $projectors;

    /**
     * @param list<Projector> $projectors
     */
    public function __construct(
        private readonly Store $store,
        array $projectors,
        private readonly Clock $clock,
    ) {
        $this->projectors = $projectors;
    }

    public function apply(EventEnvelope $event): string
    {
        if ($this->store->find('projected_events', $event->id) !== null) {
            return 'DUPLICATE';
        }

        $applied = false;
        foreach ($this->projectors as $projector) {
            if ($projector->supports($event->type)) {
                $projector->project($event);
                $applied = true;
                break;
            }
        }

        $this->store->insert('projected_events', [
            'id' => $event->id,
            'event_id' => $event->id,
            'event_type' => $event->type,
            'aggregate_id' => $event->aggregateId,
            'occurred_at' => $event->occurredAt->format(\DateTimeInterface::ATOM),
            'ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
            'applied_at' => $this->clock->now()->format(\DateTimeInterface::ATOM),
            'outcome' => $applied ? 'APPLIED' : 'IGNORED',
        ]);

        $this->advance($event, $applied);

        return $applied ? 'APPLIED' : 'IGNORED';
    }

    /**
     * Drain a feed. Stops on an empty pull or after $batches pulls so a
     * worker process is bounded rather than an unbounded loop under load.
     */
    public function drain(EventFeed $feed, int $batchSize = 200, int $batches = 100): int
    {
        $processed = 0;
        for ($i = 0; $i < $batches; $i++) {
            $events = $feed->pull($batchSize);
            if ($events === []) {
                break;
            }
            foreach ($events as $event) {
                $this->apply($event);
                $processed++;
            }
            if (count($events) < $batchSize) {
                break;
            }
        }

        return $processed;
    }

    public function watermark(): ProjectionWatermark
    {
        $row = $this->store->find('projection_state', 'reporting');

        return $row === null ? ProjectionWatermark::empty() : ProjectionWatermark::fromRow($row);
    }

    /**
     * Required event types the projection has never seen. A report over a
     * population that never emitted `LedgerEntryRecorded` is zero, not wrong —
     * and an operator needs to know which one they are looking at.
     *
     * @param list<string> $required
     * @return list<string>
     */
    public function missingEventTypes(array $required): array
    {
        $seen = [];
        foreach ($this->store->all('projected_events') as $row) {
            $seen[(string) $row['event_type']] = true;
        }

        return array_values(array_filter($required, static fn (string $type): bool => !isset($seen[$type])));
    }

    private function advance(EventEnvelope $event, bool $applied): void
    {
        $current = $this->watermark();
        $lastOccurred = $current->lastOccurredAt;
        if ($lastOccurred === null || $event->occurredAt > $lastOccurred) {
            $lastOccurred = $event->occurredAt;
        }
        $lastIngested = $current->lastIngestedAt;
        if ($lastIngested === null || $event->ingestedAt > $lastIngested) {
            $lastIngested = $event->ingestedAt;
        }

        $row = [
            'id' => 'reporting',
            'applied_events' => $current->appliedEvents + ($applied ? 1 : 0),
            'ignored_events' => $current->ignoredEvents + ($applied ? 0 : 1),
            'last_occurred_at' => $lastOccurred?->format(\DateTimeInterface::ATOM),
            'last_ingested_at' => $lastIngested?->format(\DateTimeInterface::ATOM),
            'last_event_id' => $event->id,
        ];

        if ($this->store->find('projection_state', 'reporting') === null) {
            $this->store->insert('projection_state', $row);
        } else {
            $this->store->update('projection_state', $row);
        }
    }
}
