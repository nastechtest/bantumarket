<?php

declare(strict_types=1);

namespace NasTech\Notifications;

use NasTech\SharedKernel\Persistence\Store;

/**
 * The model of the database the tests run against.
 *
 * InMemoryStore refuses an UPDATE or DELETE on notification_delivery_attempts
 * because Schema::APPEND_ONLY_TABLES names the table, and it refuses a second
 * insert on (notification_id, channel, attempt_no) because Schema::UNIQUE_INDEXES
 * names the key. The migration declares the same two rules, so a service test and
 * a production row agree about what a retry means.
 */
final class InMemoryNotificationRepository implements NotificationRepository
{
    private const NOTIFICATIONS = 'notification_notifications';
    private const ATTEMPTS = 'notification_delivery_attempts';

    public function __construct(private readonly Store $store)
    {
    }

    public function insert(Notification $notification): void
    {
        $this->store->insert(self::NOTIFICATIONS, $notification->toRow());
    }

    public function save(Notification $notification): void
    {
        $this->store->update(self::NOTIFICATIONS, $notification->toRow());
    }

    public function find(string $id): ?Notification
    {
        $row = $this->store->find(self::NOTIFICATIONS, $id);

        return $row === null ? null : Notification::fromRow($row);
    }

    public function findByEventRecipientKind(
        string $sourceEventId,
        string $recipientId,
        NotificationKind $kind,
    ): ?Notification {
        foreach ($this->store->all(self::NOTIFICATIONS) as $row) {
            if ($row['source_event_id'] === $sourceEventId
                && $row['recipient_id'] === $recipientId
                && $row['kind'] === $kind->value) {
                return Notification::fromRow($row);
            }
        }

        return null;
    }

    public function forRecipient(string $recipientId, int $limit = 50): array
    {
        $rows = [];
        foreach ($this->store->all(self::NOTIFICATIONS) as $row) {
            if ($row['recipient_id'] === $recipientId) {
                $rows[] = $row;
            }
        }
        usort($rows, static function (array $a, array $b): int {
            return strcmp((string) $b['created_at'], (string) $a['created_at'])
                ?: strcmp((string) $b['id'], (string) $a['id']);
        });

        return array_map(
            static fn (array $row): Notification => Notification::fromRow($row),
            array_slice($rows, 0, max(0, $limit)),
        );
    }

    public function insertAttempt(DeliveryAttempt $attempt): void
    {
        $this->store->insert(self::ATTEMPTS, $attempt->toRow());
    }

    public function findAttempt(string $id): ?DeliveryAttempt
    {
        $row = $this->store->find(self::ATTEMPTS, $id);

        return $row === null ? null : DeliveryAttempt::fromRow($row);
    }

    public function findAttemptByKey(
        string $notificationId,
        NotificationChannel $channel,
        int $attemptNo,
    ): ?DeliveryAttempt {
        foreach ($this->store->all(self::ATTEMPTS) as $row) {
            if ($row['notification_id'] === $notificationId
                && $row['channel'] === $channel->value
                && (int) $row['attempt_no'] === $attemptNo) {
                return DeliveryAttempt::fromRow($row);
            }
        }

        return null;
    }

    public function attemptsFor(string $notificationId): array
    {
        $rows = [];
        foreach ($this->store->all(self::ATTEMPTS) as $row) {
            if ($row['notification_id'] === $notificationId) {
                $rows[] = $row;
            }
        }
        usort($rows, static fn (array $a, array $b): int => (int) $a['attempt_no'] <=> (int) $b['attempt_no']);

        return array_map(
            static fn (array $row): DeliveryAttempt => DeliveryAttempt::fromRow($row),
            $rows,
        );
    }
}
