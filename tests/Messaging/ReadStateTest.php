<?php

declare(strict_types=1);

namespace NasTech\Tests\Messaging;

use NasTech\Messaging\NotAParticipant;
use NasTech\Messaging\MessageRefused;
use NasTech\Messaging\StaleReadVersion;
use NasTech\Tests\Messaging\Support\MessagingFixture;
use NasTech\Tests\TestCase;

/**
 * Read state is per device and moves by CAS. Both halves are negative tests: a
 * phone cannot advance a tablet's cursor, and a stale tab cannot move a cursor
 * backwards after a newer device already read further.
 */
final class ReadStateTest extends TestCase
{
    public function testReadStateIsScopedToTheDeviceThatWroteIt(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        for ($i = 1; $i <= 3; $i++) {
            $fixture->service->sendMessage($thread->id, 'acc_buyer', 'line ' . $i, 'clt_read_000' . $i);
        }

        $this->assertSame(3, $fixture->service->unreadCount($thread->id, 'acc_seller', 'device_phone'));
        $phone = $fixture->service->markRead($thread->id, 'acc_seller', 'device_phone', 2, 0);
        $this->assertSame(1, $phone['version']);
        $this->assertSame(1, $fixture->service->unreadCount($thread->id, 'acc_seller', 'device_phone'));
        $this->assertSame(
            3,
            $fixture->service->unreadCount($thread->id, 'acc_seller', 'device_tablet'),
            'a phone that read two lines does not mark them read on the tablet',
        );
    }

    public function testTwoDevicesAdvanceIndependentlyAndDoNotOverwriteEachOther(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage($thread->id, 'acc_buyer', 'one', 'clt_two_dev_01');

        $phone = $fixture->service->markRead($thread->id, 'acc_seller', 'device_phone', 1, 0);
        $tablet = $fixture->service->markRead($thread->id, 'acc_seller', 'device_tablet', 1, 0);

        $this->assertSame(1, $phone['version']);
        $this->assertSame(1, $tablet['version']);
        $this->assertNotSame($phone['id'], $tablet['id']);
        $this->assertCount(2, $fixture->store->all('messaging_read_state'));
    }

    public function testAStaleExpectedVersionIsRefusedRatherThanOverwriting(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage($thread->id, 'acc_buyer', 'one', 'clt_stale_001');
        $fixture->service->sendMessage($thread->id, 'acc_buyer', 'two', 'clt_stale_002');

        $fixture->service->markRead($thread->id, 'acc_seller', 'device_phone', 1, 0);
        // A second tab that still believes the row does not exist must not reset it.
        $this->assertThrows(
            StaleReadVersion::class,
            fn () => $fixture->service->markRead($thread->id, 'acc_seller', 'device_phone', 2, 0),
            'device_phone',
        );
    }

    public function testACursorNeverMovesBackwards(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage($thread->id, 'acc_buyer', 'one', 'clt_back_001');
        $fixture->service->sendMessage($thread->id, 'acc_buyer', 'two', 'clt_back_002');
        $row = $fixture->service->markRead($thread->id, 'acc_seller', 'device_phone', 2, 0);

        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->markRead($thread->id, 'acc_seller', 'device_phone', 1, (int) $row['version']),
            'never moves backwards',
        );
    }

    public function testACursorBeyondTheThreadOrADeviceIdThatIsNotAnInstallationIsRefused(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage($thread->id, 'acc_buyer', 'one', 'clt_bound_001');

        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->markRead($thread->id, 'acc_seller', 'device_phone', 99, 0),
            'points at a message this thread has',
        );
        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->markRead($thread->id, 'acc_seller', '/etc/passwd', 1, 0),
            'device id',
        );
    }

    public function testAStrangerCannotMoveAReadCursor(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage($thread->id, 'acc_buyer', 'one', 'clt_str_0001');

        $this->assertThrows(
            NotAParticipant::class,
            fn () => $fixture->service->markRead($thread->id, 'acc_stranger', 'device_x', 1, 0),
            'not a party',
        );
        $this->assertThrows(
            NotAParticipant::class,
            fn () => $fixture->service->unreadCount($thread->id, 'acc_stranger', 'device_x'),
            'not a party',
        );
    }
}
