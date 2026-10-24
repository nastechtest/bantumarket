<?php

declare(strict_types=1);

namespace NasTech\Tests\Messaging;

use NasTech\Messaging\ContactBlocked;
use NasTech\Messaging\MessageBody;
use NasTech\Messaging\MessageKind;
use NasTech\Messaging\MessageRefused;
use NasTech\Messaging\MessagingEvents;
use NasTech\Messaging\ThreadNotFound;
use NasTech\Tests\Messaging\Support\MessagingFixture;
use NasTech\Tests\TestCase;

/**
 * Send, edit and delete are three appends, never an update.
 *
 * The tests that matter here are the ones that would fail if a well-meaning
 * implementation "simplified" the chain into an UPDATE: the export still contains
 * the original text, an edit does not reorder the transcript, and a replayed POST
 * does not create message number two.
 */
final class MessageLifecycleTest extends TestCase
{
    public function testASentMessageAdvancesTheThreadAndPublishesOneBodylessEvent(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $message = $fixture->service->sendMessage(
            $thread->id,
            'acc_buyer',
            '  Is the box and the papers included?  ',
            'clt_send_0001',
        );

        $this->assertSame('Is the box and the papers included?', $message->body?->text);
        $this->assertSame(1, $message->sequence);
        $stored = $fixture->repository->findThread($thread->id);
        $this->assertSame(1, $stored?->messageCount());
        $this->assertSame(2, $stored?->version());

        $events = $fixture->outbox->dispatched();
        $sent = $this->event($events, MessagingEvents::MESSAGE_SENT);
        $this->assertSame('acc_seller', $sent['payload']['recipient_id']);
        $this->assertFalse(isset($sent['payload']['body']), 'the event never carries the message body');
        $this->assertFalse(
            str_contains(json_encode($sent, JSON_THROW_ON_ERROR), 'papers included'),
            'the body text appears nowhere in the outbox payload',
        );
    }

    public function testARetriedSendWithTheSameClientIdIsTheSameMessage(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $first = $fixture->service->sendMessage($thread->id, 'acc_buyer', 'Still available?', 'clt_retry_01');
        $second = $fixture->service->sendMessage($thread->id, 'acc_buyer', 'Still available?', 'clt_retry_01');

        $this->assertSame($first->id, $second->id);
        $this->assertCount(1, $fixture->store->all('messaging_messages'));
        $this->assertSame(1, $fixture->repository->findThread($thread->id)?->messageCount());
    }

    public function testAnEditAppendsANewVersionAndKeepsTheOldOneInTheExport(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $original = $fixture->service->sendMessage($thread->id, 'acc_buyer', 'R2 500', 'clt_edit_0001');
        $edit = $fixture->service->editMessage($original->id, 'acc_buyer', 'R2 400, sorry', 'clt_edit_0002');
        $fixture->service->sendMessage($thread->id, 'acc_seller', 'That works', 'clt_edit_0003');

        $this->assertSame(MessageKind::EDIT, $edit->kind);
        $this->assertSame($original->id, $edit->supersedesId);
        $this->assertCount(3, $fixture->store->all('messaging_messages'), 'the superseded row is retained');

        $page = $fixture->service->fetchMessages($thread->id, 'acc_seller');
        $this->assertCount(2, $page->messages, 'the transcript folds the chain to one line');
        $this->assertSame('R2 400, sorry', $page->messages[0]->body?->text);
        $this->assertSame('That works', $page->messages[1]->body?->text, 'the edit keeps its place above the reply');

        $export = $fixture->service->exportThread($thread->id, 'acc_buyer');
        $this->assertCount(3, $export);
        $this->assertSame('R2 500', $export[0]['body']);
        $this->assertSame('PRESENT', $export[0]['exported_state']);
        $this->assertSame('R2 400, sorry', $export[1]['body']);
        $this->assertSame('That works', $export[2]['body']);
    }

    public function testADeleteAppendsATombstoneAndTheExportStillSaysWhatWasThere(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $original = $fixture->service->sendMessage($thread->id, 'acc_buyer', 'My number is 082 123 4567', 'clt_del_00001');
        $tombstone = $fixture->service->deleteMessage($original->id, 'acc_buyer', 'clt_del_00002');

        $this->assertSame(MessageKind::TOMBSTONE, $tombstone->kind);
        $this->assertSame(null, $tombstone->body);

        $page = $fixture->service->fetchMessages($thread->id, 'acc_seller');
        $this->assertCount(1, $page->messages);
        $this->assertTrue($page->messages[0]->isDeleted());
        $this->assertSame(null, $page->messages[0]->body);

        // The point of append-only: "deleted" is metadata, not erasure of evidence.
        $export = $fixture->service->exportThread($thread->id, 'acc_buyer');
        $this->assertCount(2, $export);
        $this->assertSame('My number is 082 123 4567', $export[0]['body']);
        $this->assertSame('PRESENT', $export[0]['exported_state']);
        $this->assertSame('DELETED', $export[1]['exported_state']);
        $this->assertSame(null, $export[1]['body']);
    }

    public function testATombstoneCannotBeEditedBackIntoExistence(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $original = $fixture->service->sendMessage($thread->id, 'acc_buyer', 'hello there', 'clt_del_00003');
        $tombstone = $fixture->service->deleteMessage($original->id, 'acc_buyer', 'clt_del_00004');

        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->editMessage($tombstone->id, 'acc_buyer', 'back again', 'clt_edit_0003'),
            'cannot be edited back',
        );
        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->deleteMessage($tombstone->id, 'acc_buyer', 'clt_del_00005'),
            'already deleted',
        );
    }

    public function testOnlyTheAuthorMayEditOrDelete(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $message = $fixture->service->sendMessage($thread->id, 'acc_buyer', 'Mine to edit', 'clt_auth_0001');

        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->editMessage($message->id, 'acc_seller', 'not yours', 'clt_auth_0002'),
            'author',
        );
        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->deleteMessage($message->id, 'acc_seller', 'clt_auth_0003'),
            'author',
        );
    }

    public function testABodyIsBoundedNormalisedAndMustBeText(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();

        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->sendMessage($thread->id, 'acc_buyer', "  \n\t ", 'clt_body_0001'),
            'cannot be empty',
        );
        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->sendMessage($thread->id, 'acc_buyer', str_repeat('a', MessageBody::MAX_BYTES + 1), 'clt_body_0002'),
            'limited to 8000 bytes',
        );
        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->sendMessage($thread->id, 'acc_buyer', "\xC3\x28", 'clt_body_0003'),
            'valid UTF-8',
        );
        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->sendMessage($thread->id, 'acc_buyer', 'short id', 'bad'),
            '8–64 url-safe',
        );
    }

    public function testAttachmentsAreBoundedOpaqueReferences(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $ok = $fixture->service->sendMessage($thread->id, 'acc_buyer', 'Photos attached', 'clt_att_0001', [
            ['media_id' => 'med_photo_1', 'kind' => 'PHOTO', 'position' => 0],
            ['media_id' => 'med_photo_2', 'kind' => 'PHOTO', 'position' => 1],
        ]);
        $this->assertCount(2, $ok->attachments);

        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->sendMessage($thread->id, 'acc_buyer', 'too many', 'clt_att_0002', [
                ['media_id' => 'm1', 'kind' => 'PHOTO', 'position' => 0],
                ['media_id' => 'm2', 'kind' => 'PHOTO', 'position' => 1],
                ['media_id' => 'm3', 'kind' => 'PHOTO', 'position' => 2],
                ['media_id' => 'm4', 'kind' => 'PHOTO', 'position' => 3],
                ['media_id' => 'm5', 'kind' => 'PHOTO', 'position' => 4],
            ]),
            'at most four',
        );
        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->sendMessage($thread->id, 'acc_buyer', 'a url', 'clt_att_0003', [
                ['media_id' => 'https://cdn.example.com/x.jpg', 'kind' => 'PHOTO', 'position' => 0],
            ]),
            'media id, not a path or a URL',
        );
        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->sendMessage($thread->id, 'acc_buyer', 'dupe', 'clt_att_0004', [
                ['media_id' => 'med_same', 'kind' => 'PHOTO', 'position' => 0],
                ['media_id' => 'med_same', 'kind' => 'PHOTO', 'position' => 1],
            ]),
            'same media id',
        );
    }

    public function testAClosedThreadRefusesNewMessagesButStaysReadable(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->sendMessage($thread->id, 'acc_buyer', 'Before close', 'clt_close_001');
        $fixture->service->closeThread($thread->id, 'acc_seller', 'SOLD_ELSEWHERE');

        $this->assertThrows(
            MessageRefused::class,
            fn () => $fixture->service->sendMessage($thread->id, 'acc_buyer', 'After close', 'clt_close_002'),
            'closed',
        );
        $this->assertCount(1, $fixture->service->fetchMessages($thread->id, 'acc_buyer')->messages);
    }

    public function testAnUnknownThreadIsDistinguishedFromARefusedOne(): void
    {
        $fixture = new MessagingFixture();

        $this->assertThrows(
            ThreadNotFound::class,
            fn () => $fixture->service->sendMessage('thr_missing', 'acc_buyer', 'hello', 'clt_miss_001'),
            'Unknown thread',
        );
    }

    public function testABlockedPairCannotSendAndTheErrorNamesTheThread(): void
    {
        $fixture = new MessagingFixture();
        $thread = $fixture->openThread();
        $fixture->service->applySafetyEvent('ContactBlocked', [
            'event_id' => 'evt_block_1',
            'blocker_id' => 'acc_seller',
            'blocked_id' => 'acc_buyer',
            'reason' => 'harassment',
        ]);

        $error = $this->assertThrows(
            ContactBlocked::class,
            fn () => $fixture->service->sendMessage($thread->id, 'acc_buyer', 'Why blocked?', 'clt_blk_0001'),
            'blocked contact',
        );
        $this->assertTrue($error instanceof ContactBlocked);
        $this->assertSame($thread->id, $error->threadId);
    }

    /**
     * @param list<array<string,mixed>> $events
     * @return array<string,mixed>
     */
    private function event(array $events, string $type): array
    {
        foreach ($events as $event) {
            if ($event['event_type'] === $type) {
                return $event;
            }
        }
        $this->fail('no ' . $type . ' event was published');
    }
}
