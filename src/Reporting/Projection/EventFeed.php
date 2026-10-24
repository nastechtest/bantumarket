<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;

/**
 * A pull-based source of events. The real adapter reads `shared.outbox_messages`
 * through whatever the composition root exposes; Reporting never names the
 * table. Tests use InMemoryEventFeed, so ordering and lateness are controllable
 * rather than accidentally dependent on the wall clock.
 */
interface EventFeed
{
    /**
     * @return list<EventEnvelope> up to $limit events, oldest first
     */
    public function pull(int $limit): array;
}
