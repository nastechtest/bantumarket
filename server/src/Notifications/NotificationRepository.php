<?php

declare(strict_types=1);

namespace NasTech\Notifications;

/**
 * Storage port. The in-memory adapter models the constraints in 010; a SQL
 * adapter can speak the same methods without the service changing.
 */
interface NotificationRepository
{
    public function insert(Notification $notification): void;

    public function save(Notification $notification): void;

    public function find(string $id): ?Notification;

    public function findByEventRecipientKind(
        string $sourceEventId,
        string $recipientId,
        NotificationKind $kind,
    ): ?Notification;

    /**
     * @return list<Notification>
     */
    public function forRecipient(string $recipientId, int $limit = 50): array;

    public function insertAttempt(DeliveryAttempt $attempt): void;

    public function findAttempt(string $id): ?DeliveryAttempt;

    public function findAttemptByKey(
        string $notificationId,
        NotificationChannel $channel,
        int $attemptNo,
    ): ?DeliveryAttempt;

    /**
     * @return list<DeliveryAttempt>
     */
    public function attemptsFor(string $notificationId): array;
}
