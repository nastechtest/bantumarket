<?php

declare(strict_types=1);

namespace NasTech\Tests\Messaging;

use NasTech\Identity\AccessDenied;
use NasTech\Tests\Messaging\Support\MessagingFixture;
use NasTech\Tests\TestCase;

/**
 * Pull-based reads: the inbox is a keyset over last activity, and a transcript is a
 * keyset over the first sequence of each message. Neither uses an offset, because
 * both are read while the other party is still typing.
 */
final class InboxAndPagingTest extends TestCase
{
    public function testTheInboxIsNewestActivityFirstWithTheCounterpartyNamed(): void
    {
        $fixture = new MessagingFixture();
        $first = $fixture->openThread();
        $fixture->service->sendMessage($first->id, 'acc_buyer', 'first thread', 'clt_inbox_001');
        $fixture->clock->advance('PT5M');

        $second = $fixture->service->openThread('acc_stranger', 'acc_stranger', 'acc_seller', 'lst_watch_2', null);
        $fixture->service->sendMessage($second->id, 'acc_stranger', 'second thread', 'clt_inbox_002');

        $inbox = $fixture->service->fetchThreads('acc_seller');
        $this->assertSame([$second->id, $first->id], array_column($inbox['threads'], 'id'));
        $this->assertSame('acc_stranger', $inbox['threads'][0]['counterparty_id']);
        $this->assertSame('acc_buyer', $inbox['threads'][1]['counterparty_id']);
        $this->assertFalse(
            str_contains(json_encode($inbox, JSON_THROW_ON_ERROR), 'second thread'),
            'the inbox summary never carries a body',
        );
    }

    public function testTheInboxPagesWithAKeysetAndTheLastPageSaysSo(): void
    {
        $fixture = new MessagingFixture();
        $threads = [];
        foreach (['lst_a', 'lst_b', 'lst_c'] as $index => $listing) {
            $threads[] = $fixture->service->openThread('acc_buyer', 'acc_buyer', 'acc_seller', $listing, null);
            $fixture->service->sendMessage($threads[$index]->id, 'acc_buyer', 'message ' . $index, 'clt_page_000' . $index);
            $fixture->clock->advance('PT1M');
        }

        $pageOne = $fixture->service->fetchThreads('acc_seller', null, 2);
        $this->assertCount(2, $pageOne['threads']);
        $this->assertNotSame(null, $pageOne['next_cursor']);

        $pageTwo = $fixture->service->fetchThreads('acc_seller', $pageOne['next_cursor'], 2);
        $this->assertCount(1, $pageTwo['threads']);
        $this->assertSame(null, $pageTwo['next_cursor']);

        $this->assertSame(
            [$threads[2]->id, $threads[1]->id, $threads[0]->id],
            array_merge(array_column($pageOne['threads'], 'id'), array_column($pageTwo['threads'], 'id')),
        );
    }

    public function testATranscriptPagesBySequenceAndNeverRepeatsAMessage(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        for ($i = 1; $i <= 5; $i++) {
            $fixture->service->sendMessage(
                $thread->id,
                $i % 2 === 1 ? 'acc_buyer' : 'acc_seller',
                'line ' . $i,
                'clt_seq_000' . $i,
            );
        }

        $pageOne = $fixture->service->fetchMessages($thread->id, 'acc_buyer', null, 2);
        $this->assertSame([1, 2], array_map(static fn ($m): int => $m->sequence, $pageOne->messages));
        $this->assertSame(2, $pageOne->nextSequence);

        $pageTwo = $fixture->service->fetchMessages($thread->id, 'acc_buyer', $pageOne->nextSequence, 2);
        $this->assertSame([3, 4], array_map(static fn ($m): int => $m->sequence, $pageTwo->messages));
        $this->assertSame(4, $pageTwo->nextSequence);

        $pageThree = $fixture->service->fetchMessages($thread->id, 'acc_buyer', $pageTwo->nextSequence, 2);
        $this->assertSame([5], array_map(static fn ($m): int => $m->sequence, $pageThree->messages));
        $this->assertSame(null, $pageThree->nextSequence, 'the last page has no cursor to follow');

        $empty = $fixture->service->fetchMessages($thread->id, 'acc_buyer', 5, 2);
        $this->assertCount(0, $empty->messages);
        $this->assertSame(null, $empty->nextSequence);
    }

    public function testThePageLimitIsClampedRatherThanTrusted(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        for ($i = 1; $i <= 3; $i++) {
            $fixture->service->sendMessage($thread->id, 'acc_buyer', 'line ' . $i, 'clt_clamp_00' . $i);
        }

        $this->assertCount(3, $fixture->service->fetchMessages($thread->id, 'acc_buyer', null, 10_000)->messages);
        $this->assertCount(1, $fixture->service->fetchMessages($thread->id, 'acc_buyer', null, 0)->messages);
    }

    public function testTheInboxNeedsTheMessagingCapability(): void
    {
        $fixture = new MessagingFixture();

        $this->assertThrows(
            AccessDenied::class,
            fn () => $fixture->service->fetchThreads('acc_staff'),
            'messaging.send',
        );
    }
}
