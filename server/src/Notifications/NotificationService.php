<?php

declare(strict_types=1);

namespace NasTech\Notifications;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Notifications' public write surface. The HTTP layer and the outbox consumer
 * dispatch these methods; Application\Kernel wires the collaborators.
 *
 * Every write is one transaction. The rules that shape it:
 *   - (source_event_id, recipient_id, kind) is the idempotency key. A replayed
 *     MessageSent event finds the existing row instead of inserting a second.
 *   - a notification cannot be marked read before it exists; the lookup is the
 *     enforcement, not a stock "read whatever you like" update.
 *   - a delivery attempt requires the notification it belongs to, and
 *     (notification_id, channel, attempt_no) is unique. A retried worker run
 *     returns the first attempt rather than sending twice.
 *   - the payload guard refuses a phone number, an email address, a message body
 *     or anything from a dispute before a row can be written.
 */
final class NotificationService
{
    public function __construct(
        private readonly NotificationRepository $repository,
        private readonly UnitOfWork $uow,
        private readonly Clock $clock,
    ) {
    }

    /**
     * Record one notification. Idempotent by (event id, recipient, kind).
     *
     * `$context` is optional event metadata. It is never stored: it is checked
     * for personal data and otherwise ignored. The table's only references are
     * the opaque account and the subject id.
     *
     * @param array<string,mixed> $context
     */
    public function record(
        string $sourceEventId,
        string $recipientId,
        NotificationKind|string $kind,
        string $subjectId,
        array $context = [],
    ): Notification {
        PersonalDataGuard::assertSafe($context);
        $kind = $kind instanceof NotificationKind ? $kind : NotificationKind::parse($kind);
        $sourceEventId = self::opaque($sourceEventId, 'source event id');
        $recipientId = self::opaque($recipientId, 'recipient account');
        $subjectId = self::opaque($subjectId, 'subject id');

        $existing = $this->repository->findByEventRecipientKind($sourceEventId, $recipientId, $kind);
        if ($existing !== null) {
            return $existing;
        }

        $notification = Notification::create(
            Id::generate('ntf')->value(),
            $sourceEventId,
            $recipientId,
            $kind,
            $subjectId,
            $this->clock->now(),
        );

        $this->uow->begin();
        try {
            $this->repository->insert($notification);
            $this->uow->commit();
        } catch (UniqueConstraintViolation $race) {
            $this->uow->rollback();
            $winner = $this->repository->findByEventRecipientKind($sourceEventId, $recipientId, $kind);
            if ($winner !== null) {
                return $winner;
            }

            throw $race;
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $notification;
    }

    /**
     * Mark a notification read. The lookup happens first, so "read before
     * create" is a refusal with a 404 shape rather than an UPDATE that silently
     * touches no row. An already-read notification is returned unchanged, which
     * makes the caller's retry harmless.
     */
    public function markRead(string $notificationId, ?\DateTimeImmutable $at = null): Notification
    {
        $existing = $this->repository->find($notificationId);
        if ($existing === null) {
            throw new NotificationNotFound('Unknown notification: ' . $notificationId);
        }
        if ($existing->isRead()) {
            return $existing;
        }

        $read = $existing->markRead($at ?? $this->clock->now());

        $this->uow->begin();
        try {
            $this->repository->save($read);
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $read;
    }

    /**
     * Record one channel attempt. Idempotent on
     * (notification_id, channel, attempt_no): a retried worker run returns the
     * first attempt, so a retry cannot double-send.
     */
    public function recordDeliveryAttempt(
        string $notificationId,
        NotificationChannel|string $channel,
        int $attemptNo,
        DeliveryStatus|string $status = DeliveryStatus::QUEUED,
    ): DeliveryAttempt {
        $channel = $channel instanceof NotificationChannel ? $channel : NotificationChannel::parse($channel);
        $status = $status instanceof DeliveryStatus ? $status : DeliveryStatus::parse($status);
        if ($attemptNo < 1) {
            throw new NotificationRefused('A delivery attempt number starts at 1');
        }
        if ($this->repository->find($notificationId) === null) {
            throw new NotificationNotFound('A delivery attempt requires an existing notification: ' . $notificationId);
        }

        $existing = $this->repository->findAttemptByKey($notificationId, $channel, $attemptNo);
        if ($existing !== null) {
            return $existing;
        }

        $attempt = DeliveryAttempt::record(
            Id::generate('dlv')->value(),
            $notificationId,
            $channel,
            $attemptNo,
            $status,
            $this->clock->now(),
        );

        $this->uow->begin();
        try {
            $this->repository->insertAttempt($attempt);
            $this->uow->commit();
        } catch (UniqueConstraintViolation $race) {
            $this->uow->rollback();
            $winner = $this->repository->findAttemptByKey($notificationId, $channel, $attemptNo);
            if ($winner !== null) {
                return $winner;
            }

            throw $race;
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $attempt;
    }

    /**
     * @return list<Notification>
     */
    public function inbox(string $recipientId, int $limit = 50): array
    {
        return $this->repository->forRecipient($recipientId, $limit);
    }

    /**
     * @return list<Notification>
     */
    public function unreadFor(string $recipientId, int $limit = 50): array
    {
        return array_values(array_filter(
            $this->repository->forRecipient($recipientId, $limit),
            static fn (Notification $notification): bool => !$notification->isRead(),
        ));
    }

    private static function opaque(string $value, string $field): string
    {
        try {
            return Id::fromString($value)->value();
        } catch (\InvalidArgumentException) {
            throw new NotificationRefused(sprintf(
                'A %s must be an opaque reference of 1–64 url-safe characters; notifications never hold an address or free text',
                $field,
            ));
        }
    }
}
