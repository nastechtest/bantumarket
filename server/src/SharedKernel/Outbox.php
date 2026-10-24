<?php

declare(strict_types=1);

namespace NasTech\SharedKernel;

use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Transactional outbox.
 *
 * The rule from the module graph: dashed edges may cross a queue, solid red
 * edges may not. The outbox is what makes that distinction safe to act on —
 * the event row is written inside the same transaction as the state change, so
 * "order advanced but the notification/index/webhook never fired" cannot
 * happen, and "queue down, money state lost" cannot happen either.
 */
final class Outbox
{
    public const TABLE = 'outbox_messages';

    /** @var list<array<string,mixed>> */
    private array $dispatched = [];

    public function __construct(
        private readonly Store $store,
        private readonly UnitOfWork $uow,
        private readonly Clock $clock,
    ) {
    }

    public function publish(
        string $aggregateType,
        string $aggregateId,
        string $eventType,
        array $payload,
    ): void {
        if (!$this->uow->inTransaction()) {
            throw new \LogicException(
                'Outbox::publish() must be called inside a transaction; '
                . 'an event recorded outside the money transaction is a dual write.'
            );
        }

        $message = [
            'id' => Id::generate('obx')->value(),
            'aggregate_type' => $aggregateType,
            'aggregate_id' => $aggregateId,
            'event_type' => $eventType,
            'payload' => $payload,
            'occurred_at' => $this->clock->now()->format(\DateTimeInterface::ATOM),
            'delivered_at' => null,
        ];

        $this->store->insert(self::TABLE, $message);

        $this->uow->afterCommit('outbox:' . $message['id'], function () use ($message): void {
            $this->dispatch($message);
        });
    }

    /**
     * @return list<array<string,mixed>>
     */
    public function dispatched(): array
    {
        return $this->dispatched;
    }

    /**
     * @param array<string,mixed> $message
     */
    private function dispatch(array $message): void
    {
        // In production this is the worker's handoff: a durable queue publish,
        // at-least-once, with idempotent consumers keyed on message id. Kept
        // observable here so tests can assert nothing dispatches before commit.
        $this->dispatched[] = $message;

        $record = $this->store->find(self::TABLE, (string) $message['id']);
        if ($record !== null) {
            $record['delivered_at'] = $this->clock->now()->format(\DateTimeInterface::ATOM);
            $this->store->update(self::TABLE, $record);
        }
    }
}
