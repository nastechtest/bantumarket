<?php

declare(strict_types=1);

namespace NasTech\Tests\Notifications;

use NasTech\Notifications\NotificationKind;
use NasTech\Notifications\NotificationNotFound;
use NasTech\Notifications\NotificationRefused;
use NasTech\Tests\Notifications\Support\NotificationFixture;
use NasTech\Tests\TestCase;

/**
 * A notification is a record of an event, not a message.
 *
 * The tests that matter are the negative ones: an unknown kind, a read for a row
 * that does not exist, a read before creation, and a payload carrying a phone
 * number or a message body. Each is a way a "notification" quietly becomes a
 * second copy of personal data.
 */
final class NotificationLifecycleTest extends TestCase
{
    public function testANotificationKeepsOnlyOpaqueReferencesAndItsKind(): void
    {
        $fx = new NotificationFixture();
        $notification = $fx->record('evt_0001', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_0001');

        $this->assertSame('acc_buyer', $notification->recipientId);
        $this->assertSame(NotificationKind::MESSAGE_RECEIVED, $notification->kind);
        $this->assertSame('Messaging', $notification->sourceModule->value);
        $this->assertSame('thread', $notification->subjectType);
        $this->assertSame('thr_0001', $notification->subjectId);
        $this->assertSame(null, $notification->readAt);
        $this->assertCount(1, $fx->store->all('notification_notifications'));

        $row = $fx->store->find('notification_notifications', $notification->id);
        $this->assertNotSame(null, $row);
        foreach (['phone', 'phone_number', 'email', 'email_address', 'body', 'message_body', 'dispute_id', 'address'] as $forbidden) {
            $this->assertFalse(array_key_exists($forbidden, (array) $row), "the row gained a {$forbidden} column");
        }
    }

    public function testTheSameEventRecipientAndKindProducesOneRow(): void
    {
        $fx = new NotificationFixture();
        $first = $fx->record('evt_dup', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_0001');
        $second = $fx->record('evt_dup', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_0001');

        $this->assertSame($first->id, $second->id, 'a replay must return the first notification');
        $this->assertCount(1, $fx->store->all('notification_notifications'));
    }

    public function testTheSameEventForAnotherRecipientOrKindIsAnotherNotification(): void
    {
        $fx = new NotificationFixture();
        $first = $fx->record('evt_fanout', 'acc_buyer', 'ORDER_PLACED', 'ord_0001');
        $second = $fx->record('evt_fanout', 'acc_seller', 'ORDER_PLACED', 'ord_0001');
        $third = $fx->record('evt_fanout', 'acc_buyer', 'ORDER_COMPLETED', 'ord_0001');

        $this->assertNotSame($first->id, $second->id, 'the same event fans out to two recipients');
        $this->assertNotSame($first->id, $third->id, 'the same event can be two kinds for one recipient');
        $this->assertCount(3, $fx->store->all('notification_notifications'));
    }

    public function testAnInventedKindIsRefusedAtTheServiceBoundary(): void
    {
        $fx = new NotificationFixture();

        $this->assertThrows(
            NotificationRefused::class,
            fn () => $fx->record('evt_bad_kind', 'acc_buyer', 'EMAIL_DIGEST', 'thr_0001'),
            'Unknown notification kind',
        );
        $this->assertSame([], $fx->store->all('notification_notifications'));
    }

    public function testANotificationCannotBeMarkedReadBeforeItExists(): void
    {
        $fx = new NotificationFixture();

        $this->assertThrows(
            NotificationNotFound::class,
            fn () => $fx->service->markRead('ntf_does_not_exist'),
            'Unknown notification',
        );
        $this->assertSame([], $fx->store->all('notification_notifications'));
    }

    public function testMarkingReadRecordsTheInstantAndAnAlreadyReadRowIsUnchanged(): void
    {
        $fx = new NotificationFixture();
        $notification = $fx->record('evt_read', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_0001');
        $fx->advance('PT5M');

        $read = $fx->service->markRead($notification->id);
        $this->assertTrue($read->isRead());
        $this->assertSame('2026-10-22T09:05:00+00:00', $read->readAt?->format(\DateTimeInterface::ATOM));

        $fx->advance('PT5M');
        $again = $fx->service->markRead($notification->id);
        $this->assertSame($read->readAt?->format(\DateTimeInterface::ATOM), $again->readAt?->format(\DateTimeInterface::ATOM), 'a retry does not move the read instant');
        $this->assertCount(1, $fx->store->all('notification_notifications'));
    }

    public function testAReadInstantBeforeCreationIsRefused(): void
    {
        $fx = new NotificationFixture('2026-10-22T09:00:00+00:00');
        $notification = $fx->record('evt_early', 'acc_buyer', 'MESSAGE_RECEIVED', 'thr_0001');

        $this->assertThrows(
            NotificationRefused::class,
            fn () => $fx->service->markRead($notification->id, new \DateTimeImmutable('2026-10-22T08:59:59+00:00')),
            'before it was created',
        );
        $this->assertSame(null, $fx->repository->find($notification->id)?->readAt);
    }

    public function testAPayloadCarryingPersonalDataIsRefused(): void
    {
        $fx = new NotificationFixture();

        $payloads = [
            ['phone' => '082 123 4567'],
            ['email_address' => 'buyer@example.co.za'],
            ['body' => 'Email me at buyer@example.co.za'],
            ['dispute_body' => 'The seller promised a refund'],
            ['subject_id' => 'buyer@example.co.za'],
        ];

        foreach ($payloads as $payload) {
            $this->assertThrows(
                NotificationRefused::class,
                fn () => $fx->service->record(
                    'evt_' . array_key_first($payload),
                    'acc_buyer',
                    'MESSAGE_RECEIVED',
                    (string) ($payload['subject_id'] ?? 'thr_0001'),
                    $payload,
                ),
                '',
            );
        }

        $this->assertSame([], $fx->store->all('notification_notifications'), 'no refused payload may leave a row');
    }

    public function testOnlyOpaqueAccountAndSubjectReferencesAreAccepted(): void
    {
        $fx = new NotificationFixture();

        $this->assertThrows(
            NotificationRefused::class,
            fn () => $fx->record('evt_addr_1', 'buyer@example.co.za', 'MESSAGE_RECEIVED', 'thr_0001'),
            'opaque reference',
        );
        $this->assertThrows(
            NotificationRefused::class,
            fn () => $fx->record('evt_addr_2', 'acc_buyer', 'MESSAGE_RECEIVED', '082 123 4567'),
            'opaque reference',
        );
        $this->assertSame([], $fx->store->all('notification_notifications'));
    }
}
