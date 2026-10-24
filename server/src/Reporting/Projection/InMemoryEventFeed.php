<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;

/**
 * Deterministic feed for tests and for a replay of a recorded outbox.
 *
 * Events are returned in ingestion order, which is the order the worker would
 * see them. A late event is one whose occurred_at is earlier than an event
 * already delivered — deliberately constructible here.
 */
final class InMemoryEventFeed implements EventFeed
{
    /** @var list<EventEnvelope> */
    private array $events;

    /** @var int */
    private int $cursor = 0;

    /**
     * @param list<EventEnvelope> $events
     */
    public function __construct(array $events = [])
    {
        $this->events = $events;
    }

    public function push(EventEnvelope $event): void
    {
        $this->events[] = $event;
    }

    public function pull(int $limit): array
    {
        $slice = array_slice($this->events, $this->cursor, $limit);
        $this->cursor += count($slice);

        return $slice;
    }

    public function remaining(): int
    {
        return count($this->events) - $this->cursor;
    }
}
