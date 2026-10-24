<?php

declare(strict_types=1);

namespace NasTech\Reporting\Projection;

use NasTech\Reporting\EventEnvelope;
use NasTech\Reporting\EventType;
use NasTech\SharedKernel\Persistence\Store;

/**
 * Capture jobs, and the cost per item against the ≈R270 assumption.
 *
 * A cost is only recorded on completion, and it is the amount the producing
 * module booked — not a rate multiplied by hours here. The assumption lives in
 * the report as a constant so finance can see variance, not so Reporting can
 * price a job.
 */
final class CaptureProjector implements Projector
{
    public const ASSUMPTION_CENTS = 27_000;

    public const STATES = ['intake', 'captured', 'processed', 'qc_auto', 'qc_human', 'published', 'failed', 'reshot'];

    public function __construct(private readonly Store $store)
    {
    }

    public function supports(string $eventType): bool
    {
        return in_array($eventType, [EventType::CAPTURE_JOB_STATE_CHANGED, EventType::CAPTURE_JOB_COMPLETED], true);
    }

    public function project(EventEnvelope $event): void
    {
        $jobId = $event->string('job_id');
        if ($event->type === EventType::CAPTURE_JOB_STATE_CHANGED) {
            $state = $event->string('state');
            $this->assertState($state);
            $row = $this->store->find('capture_facts', $jobId);
            if ($row === null) {
                $this->store->insert('capture_facts', [
                    'id' => $jobId,
                    'job_id' => $jobId,
                    'item_id' => $event->string('item_id'),
                    'state' => $state,
                    'cost_cents' => null,
                    'currency' => $event->currency(),
                    'changed_at' => $event->occurredAt->format(\DateTimeInterface::ATOM),
                    'changed_ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
                    'last_ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
                ]);

                return;
            }
            $row['state'] = $state;
            $row['changed_at'] = $event->occurredAt->format(\DateTimeInterface::ATOM);
            $row['changed_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
            $row['last_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
            $this->store->update('capture_facts', $row);

            return;
        }

        $cost = $event->cents('cost_cents');
        $state = $event->optionalString('state') ?? 'published';
        $this->assertState($state);
        $row = $this->store->find('capture_facts', $jobId);
        if ($row === null) {
            $this->store->insert('capture_facts', [
                'id' => $jobId,
                'job_id' => $jobId,
                'item_id' => $event->string('item_id'),
                'state' => $state,
                'cost_cents' => $cost,
                'currency' => $event->currency(),
                'changed_at' => $event->occurredAt->format(\DateTimeInterface::ATOM),
                'changed_ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
                'last_ingested_at' => $event->ingestedAt->format(\DateTimeInterface::ATOM),
            ]);

            return;
        }
        $row['state'] = $state;
        $row['cost_cents'] = $cost;
        $row['changed_at'] = $event->occurredAt->format(\DateTimeInterface::ATOM);
        $row['changed_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
        $row['last_ingested_at'] = $event->ingestedAt->format(\DateTimeInterface::ATOM);
        $this->store->update('capture_facts', $row);
    }

    private function assertState(string $state): void
    {
        if (!in_array($state, self::STATES, true)) {
            throw new \InvalidArgumentException("Capture state is not in the contract: {$state}");
        }
    }
}
