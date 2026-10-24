<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;
use NasTech\Reporting\EventType;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Inspection demand, including the non-3D path.
 *
 * `used_3d` is a property of the view, never a filter on the report. The
 * conversion report counts every view and splits by the flag, so a buyer who
 * inspected through photography counts; building the metric only over the 3D
 * flag would make the funnel look better exactly where the scene runtime is
 * least available (low-end Android), which is the opposite of what the exit
 * test needs.
 */
final class InspectionProjector implements Projector
{
    public function __construct(private readonly Store $store)
    {
    }

    public function supports(string $eventType): bool
    {
        return $eventType === EventType::LISTING_VIEWED;
    }

    public function project(EventEnvelope $event): void
    {
        $this->store->insert('inspection_facts', [
            'id' => $event->string('view_id'),
            'view_id' => $event->string('view_id'),
            'listing_id' => $event->string('listing_id'),
            'session_id' => $event->string('session_id'),
            'used_3d' => (bool) ($event->payload['used_3d'] ?? false),
            'viewed_at' => $event->occurredAt->format(\DateTimeInterface::ATOM),
            'ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
        ]);
    }
}
