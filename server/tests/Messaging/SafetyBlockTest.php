<?php

declare(strict_types=1);

namespace NasTech\Tests\Messaging;

use NasTech\Messaging\ContactBlocked;
use NasTech\Messaging\MessageRefused;
use NasTech\Messaging\MessagingEvents;
use NasTech\Messaging\NotAParticipant;
use NasTech\Messaging\ThreadReportReason;
use NasTech\Tests\Messaging\Support\MessagingFixture;
use NasTech\Tests\TestCase;

/**
 * Reports are append-only facts the participant files; blocks are Safety's decision
 * projected locally. Messaging deliberately does not decide either one itself.
 */
final class SafetyBlockTest extends TestCase
{
    public function testAParticipantCanReportAThreadAndTheEventCarriesNoDetails(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage($thread->id, 'acc_seller', 'Send me the money off the app', 'clt_rep_0001');

        $report = $fixture->service->reportThread(
            $thread->id,
            'acc_buyer',
            ThreadReportReason::SCAM,
            'Asked for an EFT outside escrow',
            1,
        );

        $this->assertSame(ThreadReportReason::SCAM, $report->reason);
        $this->assertCount(1, $fixture->store->all('messaging_thread_reports'));
        $event = null;
        foreach ($fixture->outbox->dispatched() as $candidate) {
            if ($candidate['event_type'] === MessagingEvents::THREAD_REPORTED) {
                $event = $candidate;
            }
        }
        $this->assertNotSame(null, $event, 'a ThreadReported event was published');
        $this->assertSame('SCAM', $event['payload']['reason']);
        $this->assertFalse(isset($event['payload']['details']), 'free-text details stay in the module');
    }

    public function testAReportFromAStrangerOrAboutAMessageThatDoesNotExistIsRefused(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage($thread->id, 'acc_seller', 'hello', 'clt_rep_0002');

        $this->assertThrows(
            NotAParticipant::class,
            fn () => $fixture->service->reportThread($thread->id, 'acc_stranger', ThreadReportReason::SPAM, null),
            'not a party',
        );
        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->reportThread($thread->id, 'acc_buyer', ThreadReportReason::SCAM, null, 7),
            'not in this thread',
        );
    }

    public function testAnOtherReportMustStateWhatHappened(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();

        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->reportThread($thread->id, 'acc_buyer', ThreadReportReason::OTHER, '   '),
            'must say what happened',
        );
    }

    public function testABlockEventIsProjectedOnceEvenWhenReplayed(): void
    {
        $fixture = new MessagingFixture();
        $payload = [
            'event_id' => 'evt_block_same',
            'blocker_id' => 'acc_seller',
            'blocked_id' => 'acc_buyer',
            'reason' => 'repeated harassment',
        ];

        $fixture->service->applySafetyEvent('ContactBlocked', $payload);
        $fixture->service->applySafetyEvent('ContactBlocked', $payload);

        $this->assertCount(1, $fixture->store->all('messaging_contact_blocks'));
    }

    public function testABlockRefusesBothANewThreadAndAFurtherMessage(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->applySafetyEvent('ContactBlocked', [
            'event_id' => 'evt_block_2',
            'blocker_id' => 'acc_seller',
            'blocked_id' => 'acc_buyer',
            'reason' => 'harassment',
        ]);

        $this->assertThrows(
            ContactBlocked::class,
            fn () => $fixture->service->openThread('acc_buyer', 'acc_buyer', 'acc_seller', 'lst_new', null),
            'blocked contact',
        );
        $this->assertThrows(
            ContactBlocked::class,
            fn () => $fixture->service->sendMessage($thread->id, 'acc_buyer', 'hello?', 'clt_blk_0002'),
            'blocked contact',
        );
    }

    public function testAnUnblockReleasesTheBlockAndReplayChangesNothing(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->applySafetyEvent('ContactBlocked', [
            'event_id' => 'evt_block_3',
            'blocker_id' => 'acc_seller',
            'blocked_id' => 'acc_buyer',
            'reason' => 'harassment',
        ]);
        $fixture->service->applySafetyEvent('ContactUnblocked', [
            'event_id' => 'evt_unblock_3',
            'blocker_id' => 'acc_seller',
            'blocked_id' => 'acc_buyer',
        ]);

        $block = $fixture->store->all('messaging_contact_blocks')[0];
        $this->assertFalse((bool) $block['active']);
        $this->assertNotSame(null, $block['released_at']);

        $fixture->service->applySafetyEvent('ContactUnblocked', [
            'event_id' => 'evt_unblock_3',
            'blocker_id' => 'acc_seller',
            'blocked_id' => 'acc_buyer',
        ]);
        $this->assertCount(1, $fixture->store->all('messaging_contact_blocks'));

        $message = $fixture->service->sendMessage($thread->id, 'acc_buyer', 'thanks for unblocking', 'clt_blk_0003');
        $this->assertSame(1, $message->sequence);
    }

    public function testAnUnblockWithoutABlockAndAnEventWithoutIdsAreHarmlessOrRefused(): void
    {
        $fixture = new MessagingFixture();
        $fixture->service->applySafetyEvent('ContactUnblocked', [
            'event_id' => 'evt_unblock_alone',
            'blocker_id' => 'acc_seller',
            'blocked_id' => 'acc_buyer',
        ]);
        $this->assertCount(0, $fixture->store->all('messaging_contact_blocks'));

        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->applySafetyEvent('ContactBlocked', ['event_id' => 'evt_incomplete']),
            'names its event id and both accounts',
        );

        // Foreign event types on the shared consumer are ignored, not stored.
        $fixture->service->applySafetyEvent('RatingSubmitted', ['event_id' => 'evt_other']);
        $this->assertCount(0, $fixture->store->all('messaging_contact_blocks'));
    }

    public function testContactBlockRefusesSelfAbuseAndAReasonlessBlock(): void
    {
        $fixture = new MessagingFixture();

        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->applySafetyEvent('ContactBlocked', [
                'event_id' => 'evt_self',
                'blocker_id' => 'acc_buyer',
                'blocked_id' => 'acc_buyer',
                'reason' => 'me',
            ]),
            'cannot block itself',
        );
        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->applySafetyEvent('ContactBlocked', [
                'event_id' => 'evt_blank',
                'blocker_id' => 'acc_buyer',
                'blocked_id' => 'acc_seller',
                'reason' => '  ',
            ]),
            'records a reason',
        );
    }

    public function testAnOrderEventClosesTheThreadAndAnUnrelatedOneIsIgnored(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->applyOrderEvent('OrderClosed', []);
        $this->assertSame('OPEN', $fixture->store->all('messaging_threads')[0]['status']);

        $fixture->service->applyOrderEvent('OrderClosed', ['thread_id' => $thread->id]);
        $this->assertSame('CLOSED', $fixture->store->all('messaging_threads')[0]['status']);
        $this->assertSame('ORDER_CLOSED', $fixture->store->all('messaging_threads')[0]['closed_reason']);
    }

    public function testClosingAThreadRequiresAReason(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();

        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->closeThread($thread->id, 'acc_buyer', '   '),
            'states a reason',
        );
    }
}
