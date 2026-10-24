<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;
use NasTech\Reporting\EventType;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Disputes: opened once, decided once.
 *
 * A decided dispute without an outcome is not a state the DDL allows, and the
 * report's outcome mix counts only decided cases — otherwise "open" would be a
 * sixth outcome, which is exactly the number an operator would misread as
 * cases going the buyer's way.
 */
final class DisputeProjector implements Projector
{
    public const OUTCOMES = ['BUYER_FAVOUR', 'SELLER_FAVOUR', 'SPLIT', 'WITHDRAWN'];

    public function __construct(private readonly Store $store)
    {
    }

    public function supports(string $eventType): bool
    {
        return in_array($eventType, [EventType::DISPUTE_OPENED, EventType::DISPUTE_DECIDED], true);
    }

    public function project(EventEnvelope $event): void
    {
        if ($event->type === EventType::DISPUTE_OPENED) {
            $this->store->insert('dispute_facts', [
                'id' => $event->string('case_id'),
                'case_id' => $event->string('case_id'),
                'order_id' => $event->string('order_id'),
                'kind' => $event->string('kind'),
                'opened_at' => $event->occurredAt->format(\DateTimeInterface::ATOM),
                'opened_ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
                'decided_at' => null,
                'decided_ingested_at' => null,
                'outcome' => null,
            ]);

            return;
        }

        $caseId = $event->string('case_id');
        $row = $this->store->find('dispute_facts', $caseId);
        if ($row === null) {
            throw new \RuntimeException("Dispute decision arrived for unknown case {$caseId}");
        }
        $outcome = $event->string('outcome');
        if (!in_array($outcome, self::OUTCOMES, true)) {
            throw new \InvalidArgumentException("Dispute outcome is not in the contract: {$outcome}");
        }
        $row['outcome'] = $outcome;
        $row['decided_at'] = $event->occurredAt->format(\DateTimeInterface::ATOM);
        $row['decided_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
        $this->store->update('dispute_facts', $row);
    }
}
