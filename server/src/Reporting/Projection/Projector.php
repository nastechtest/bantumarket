<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;

/**
 * One event type's translation from event to projection rows.
 *
 * A projector decides nothing about money: it copies the fields the producing
 * module recorded. The moment a projector recomputes a commission from a
 * gross amount there are two pricing authorities, and the ledger loses.
 */
interface Projector
{
    public function supports(string $eventType): bool;

    /**
     * Write the projection rows. Must be idempotent at the storage layer (the
     * tables carry the unique keys); the worker additionally refuses to apply
     * an event id twice.
     */
    public function project(EventEnvelope $event): void;
}
