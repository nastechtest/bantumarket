<?php

declare(strict_types=1);

namespace NasTech\Tests\Notifications;

use NasTech\Notifications\DeliveryStatus;
use NasTech\Notifications\NotificationChannel;
use NasTech\Notifications\NotificationNotFound;
use NasTech\Notifications\NotificationRefused;
use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;
use NasTech\Tests\Notifications\Support\NotificationFixture;
use NasTech\Tests\TestCase;

/**
 * Delivery attempts are evidence: append-only, scoped to a real notification,
 * and unique per (notification, channel, attempt number).
 *
 * The retry test is the load-bearing one. A worker that crashes after recording
 * attempt 1 and runs again must see the same attempt, not send twice. The
 * unique index is what makes that true even if the service check is skipped.
 */
final class DeliveryAttemptTest extends TestCase
{
    public function testADeliveryAttemptRequiresAnExistingNotification(): void
    {
        $fx = new NotificationFixture();

        $this->assertThrows(
            NotificationNotFound::class,
            fn () => $fx->attempt('ntf_missing', NotificationChannel::IN_APP, 1),
            'requires an existing notification',
        );
        $this->assertSame([], $fx->store->all('notification_delivery_attempts'));
    }

    public function testAnAttemptRecordsItsChannelNumberAndStatus(): void
    {
        $fx = new NotificationFixture();
        $notification = $fx->record('evt_delivery_1', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_0001');

        $attempt = $fx->attempt($notification->id, NotificationChannel::EMAIL, 1, DeliveryStatus::SENT);

        $this->assertSame($notification->id, $attempt->notificationId);
        $this->assertSame(NotificationChannel::EMAIL, $attempt->channel);
        $this->assertSame(1, $attempt->attemptNo);
        $this->assertSame(DeliveryStatus::SENT, $attempt->status);
        $this->assertCount(1, $fx->repository->attemptsFor($notification->id));
    }

    public function testARetryWithTheSameAttemptNumberDoesNotSendTwice(): void
    {
        $fx = new NotificationFixture();
        $notification = $fx->record('evt_retry_1', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_0001');

        $first = $fx->attempt($notification->id, NotificationChannel::EMAIL, 1, DeliveryStatus::FAILED);
        $second = $fx->attempt($notification->id, NotificationChannel::EMAIL, 1, DeliveryStatus::SENT);

        $this->assertSame($first->id, $second->id, 'a retry returns the first attempt, not a second send');
        $this->assertSame(DeliveryStatus::FAILED, $second->status, 'the stored attempt is not rewritten');
        $this->assertCount(1, $fx->store->all('notification_delivery_attempts'));
    }

    public function testANewAttemptNumberIsANewAttempt(): void
    {
        $fx = new NotificationFixture();
        $notification = $fx->record('evt_retry_2', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_0001');

        $one = $fx->attempt($notification->id, NotificationChannel::EMAIL, 1, DeliveryStatus::FAILED);
        $two = $fx->attempt($notification->id, NotificationChannel::EMAIL, 2, DeliveryStatus::SENT);

        $this->assertNotSame($one->id, $two->id);
        $this->assertSame(2, $two->attemptNo);
        $this->assertCount(2, $fx->repository->attemptsFor($notification->id));
    }

    public function testAttemptsAreAppendOnly(): void
    {
        $fx = new NotificationFixture();
        $notification = $fx->record('evt_append', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_0001');
        $attempt = $fx->attempt($notification->id);
        $row = $fx->store->find('notification_delivery_attempts', $attempt->id);
        $this->assertNotSame(null, $row);

        $this->assertThrows(
            \DomainException::class,
            fn () => $fx->store->update('notification_delivery_attempts', (array) $row),
            'append-only',
        );
        $this->assertThrows(
            \DomainException::class,
            fn () => $fx->store->delete('notification_delivery_attempts', $attempt->id),
            'append-only',
        );
        $this->assertCount(1, $fx->store->all('notification_delivery_attempts'));
    }

    public function testTheUniqueIndexRefusesADuplicateEvenWhenTheServiceIsBypassed(): void
    {
        $fx = new NotificationFixture();
        $notification = $fx->record('evt_unique', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_0001');
        $attempt = $fx->attempt($notification->id, NotificationChannel::EMAIL, 1);
        $row = $fx->store->find('notification_delivery_attempts', $attempt->id);

        $duplicate = (array) $row;
        $duplicate['id'] = 'dlv_bypass_1';

        $this->assertThrows(
            UniqueConstraintViolation::class,
            fn () => $fx->store->insert('notification_delivery_attempts', $duplicate),
            'Unique violation',
        );
    }

    public function testTheChannelAndStatusVocabulariesAreClosed(): void
    {
        $fx = new NotificationFixture();
        $notification = $fx->record('evt_vocab', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_0001');

        $this->assertThrows(
            NotificationRefused::class,
            fn () => $fx->attempt($notification->id, 'FAX', 1),
            'Unknown delivery channel',
        );
        $this->assertThrows(
            NotificationRefused::class,
            fn () => $fx->attempt($notification->id, NotificationChannel::IN_APP, 1, 'PENDING'),
            'Unknown delivery status',
        );
        $this->assertThrows(
            NotificationRefused::class,
            fn () => $fx->attempt($notification->id, NotificationChannel::IN_APP, 0),
            'starts at 1',
        );
    }
}
