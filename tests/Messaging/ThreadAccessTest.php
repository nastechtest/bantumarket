<?php

declare(strict_types=1);

namespace NasTech\Tests\Messaging;

use NasTech\Messaging\AuditAccessRefused;
use NasTech\Messaging\NotAParticipant;
use NasTech\Messaging\ThreadStatus;
use NasTech\Tests\Messaging\Support\MessagingFixture;
use NasTech\Tests\TestCase;

/**
 * A thread is visible to its two parties and to a capability-checked audit read.
 * Nothing else. The negative cases are the test: a stranger fetching, a stranger
 * exporting, a staff account without the capability.
 */
final class ThreadAccessTest extends TestCase
{
    public function testAStrangerCannotFetchMessagesFromAThreadTheyAreNotOn(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage($thread->id, 'acc_buyer', 'Is the box included?', 'clt_00000001');

        $this->assertThrows(
            NotAParticipant::class,
            fn () => $fixture->service->fetchMessages($thread->id, 'acc_stranger'),
            'not a party',
        );
        $this->assertThrows(
            NotAParticipant::class,
            fn () => $fixture->service->exportThread($thread->id, 'acc_stranger'),
            'not a party',
        );
    }

    public function testAnAuditReadNeedsAStaffCapabilityAndAReason(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage($thread->id, 'acc_seller', 'Collection is at the shop.', 'clt_00000002');

        $this->assertThrows(
            \NasTech\Identity\AccessDenied::class,
            fn () => $fixture->service->readThreadForAudit($thread->id, 'acc_buyer', 'case_1', 'fraud review', 'req_1'),
            'capability',
        );
        $this->assertThrows(
            AuditAccessRefused::class,
            fn () => $fixture->service->readThreadForAudit($thread->id, 'acc_staff', '', 'fraud review', 'req_1'),
            'case',
        );

        $read = $fixture->service->readThreadForAudit($thread->id, 'acc_staff', 'case_1', 'fraud review', 'req_1');
        $this->assertCount(1, $read['messages']);
        $this->assertCount(1, $fixture->audit->written());
        $this->assertSame('thread.read_for_audit', $fixture->audit->written()[0]->action);
    }

    public function testAnOrderContextThreadSurvivesCancellationButStaysReadableOnlyToItsParties(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->service->openThread('acc_buyer', 'acc_buyer', 'acc_seller', 'lst_watch_1', 'ord_123');
        $fixture->service->sendMessage($thread->id, 'acc_buyer', 'When can I collect?', 'clt_00000003');
        $fixture->service->applyOrderEvent('OrderCancelled', ['thread_id' => $thread->id]);

        $this->assertSame(ThreadStatus::CLOSED, $fixture->repository->findThread($thread->id)?->status());
        $this->assertCount(1, $fixture->service->fetchMessages($thread->id, 'acc_seller')->messages);
        $this->assertThrows(
            NotAParticipant::class,
            fn () => $fixture->service->fetchMessages($thread->id, 'acc_stranger'),
        );
        $this->assertThrows(
            \NasTech\Messaging\MessageRefused::class,
            fn () => $fixture->service->sendMessage($thread->id, 'acc_buyer', 'Any update?', 'clt_00000004'),
            'closed',
        );
    }

    public function testOpeningAThreadWithYourselfIsRefused(): void
    {
        $fixture = new MessagingFixture();
        $this->assertThrows(
            \NasTech\Messaging\MessageRefused::class,
            fn () => $fixture->service->openThread('acc_buyer', 'acc_buyer', 'acc_buyer', 'lst_watch_1', null),
            'two different accounts',
        );
    }

    public function testOpeningThreadsAboutNothingIsRefused(): void
    {
        $fixture = new MessagingFixture();
        $this->assertThrows(
            \NasTech\Messaging\MessageRefused::class,
            fn () => $fixture->service->openThread('acc_buyer', 'acc_buyer', 'acc_seller', null, null),
            'listing or an order',
        );
    }

    public function testTwoTapsProduceOneThread(): void
    {
        $fixture = new MessagingFixture();
        $first = $fixture->openThread();
        $second = $fixture->service->openThread('acc_seller', 'acc_buyer', 'acc_seller', 'lst_watch_1', null);

        $this->assertSame($first->id, $second->id);
        $this->assertCount(1, $fixture->store->all('messaging_threads'));
    }
}
