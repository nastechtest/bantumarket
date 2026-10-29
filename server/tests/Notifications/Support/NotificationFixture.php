<?php

declare(strict_types=1);

namespace NasTech\Tests\Notifications\Support;

use NasTech\Notifications\DeliveryStatus;
use NasTech\Notifications\Notification;
use NasTech\Notifications\NotificationChannel;
use NasTech\Notifications\NotificationKind;
use NasTech\Notifications\NotificationRepository;
use NasTech\Notifications\NotificationService;
use NasTech\Notifications\Wiring;
use NasTech\SharedKernel\FrozenClock;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\InMemoryUnitOfWork;

/**
 * The one fixture every Notifications test builds on. It uses the same
 * InMemoryStore, schema lists, unit of work and Wiring the module ships, so a
 * test cannot pass on a friendlier model than production.
 */
final class NotificationFixture
{
    public readonly InMemoryStore $store;
    public readonly InMemoryUnitOfWork $uow;
    public readonly FrozenClock $clock;
    public readonly NotificationRepository $repository;
    public readonly NotificationService $service;

    public function __construct(string $now = '2026-10-22T09:00:00+00:00')
    {
        $this->store = new InMemoryStore();
        Wiring::install($this->store);
        $this->clock = FrozenClock::at($now);
        $this->uow = new InMemoryUnitOfWork($this->store);
        $this->repository = Wiring::repository($this->store);
        $this->service = Wiring::service($this->repository, $this->uow, $this->clock);
    }

    public function record(
        string $eventId,
        string $recipientId,
        NotificationKind|string $kind,
        string $subjectId,
    ): Notification {
        return $this->service->record($eventId, $recipientId, $kind, $subjectId);
    }

    public function attempt(
        string $notificationId,
        NotificationChannel|string $channel = NotificationChannel::IN_APP,
        int $attemptNo = 1,
        DeliveryStatus|string $status = DeliveryStatus::QUEUED,
    ): \NasTech\Notifications\DeliveryAttempt {
        return $this->service->recordDeliveryAttempt($notificationId, $channel, $attemptNo, $status);
    }

    public function advance(string $interval): void
    {
        $this->clock->advance($interval);
    }
}
