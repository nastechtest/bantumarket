<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;
use NasTech\Reporting\EventType;
use NasTech\Reporting\Schema;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Listings and the seller cohort.
 *
 * The cohort row is written once, from the onboarding event, and never revised:
 * a seller who later becomes pilot-programme eligible must not have history
 * rewritten, because every exit test is a before/after comparison and the
 * "before" has to stay as it was. A re-onboarding event is rejected by the
 * unique key rather than silently overwriting the design that was written down.
 */
final class ListingProjector implements Projector
{
    public function __construct(private readonly Store $store)
    {
    }

    public function supports(string $eventType): bool
    {
        return in_array($eventType, [
            EventType::SELLER_ONBOARDED,
            EventType::LISTING_CREATED,
            EventType::LISTING_WENT_LIVE,
            EventType::LISTING_MEDIA_ATTACHED,
        ], true);
    }

    public function project(EventEnvelope $event): void
    {
        switch ($event->type) {
            case EventType::SELLER_ONBOARDED:
                $this->cohort($event);

                return;
            case EventType::LISTING_CREATED:
                $this->created($event);

                return;
            case EventType::LISTING_WENT_LIVE:
                $this->wentLive($event);

                return;
            case EventType::LISTING_MEDIA_ATTACHED:
                $this->media($event);

                return;
        }

        throw new \LogicException('ListingProjector asked to project an event it does not support');
    }

    private function cohort(EventEnvelope $event): void
    {
        $this->store->insert('seller_cohorts', [
            'id' => $event->string('seller_id'),
            'seller_id' => $event->string('seller_id'),
            'city' => $event->string('city'),
            'cohort_week' => $event->string('cohort_week'),
            'pilot_capture' => (bool) ($event->payload['pilot_capture'] ?? false),
            'joined_at' => $event->occurredAt->format(\DateTimeInterface::ATOM),
            'ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
        ]);
    }

    private function created(EventEnvelope $event): void
    {
        $at = $event->occurredAt->format(\DateTimeInterface::ATOM);
        $this->store->insert('listing_facts', [
            'id' => $event->string('listing_id'),
            'listing_id' => $event->string('listing_id'),
            'seller_id' => $event->string('seller_id'),
            'category_id' => $event->string('category_id'),
            'city' => $event->string('city'),
            'created_at' => $at,
            'created_ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
            'live_at' => null,
            'live_ingested_at' => null,
            'first_media_at' => null,
            'media_ingested_at' => null,
            'media_count' => 0,
            'currency' => $event->currency(),
            'last_ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
        ]);
    }

    private function wentLive(EventEnvelope $event): void
    {
        $row = $this->requireListing($event);
        // Live is written once. A second ListingWentLive is a producer replay or
        // a bug; taking the later timestamp would quietly lengthen time-to-live.
        if ($row['live_at'] === null) {
            $row['live_at'] = $event->occurredAt->format(\DateTimeInterface::ATOM);
            $row['live_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
            $row['last_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
            $this->store->update('listing_facts', $row);
        }
    }

    private function media(EventEnvelope $event): void
    {
        $row = $this->requireListing($event);
        $row['media_count'] = (int) $row['media_count'] + 1;
        $row['first_media_at'] = $row['first_media_at']
            ?? $event->occurredAt->format(\DateTimeInterface::ATOM);
        $row['media_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
        $row['last_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
        $this->store->update('listing_facts', $row);
    }

    /**
     * @return array<string,mixed>
     */
    private function requireListing(EventEnvelope $event): array
    {
        $row = $this->store->find('listing_facts', $event->string('listing_id'));
        if ($row === null) {
            // Out-of-order delivery is a real possibility with an at-least-once
            // outbox. Refusing the event leaves it unapplied and the worker
            // retries the batch in order; applying it against a made-up row would
            // invent a listing that was never created.
            throw new \RuntimeException(sprintf(
                'Event %s (%s) arrived for listing %s before its ListingCreated event',
                $event->id,
                $event->type,
                $event->string('listing_id'),
            ));
        }

        return $row;
    }
}
