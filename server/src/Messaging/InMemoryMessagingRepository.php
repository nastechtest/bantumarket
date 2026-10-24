<?php

declare(strict_types=1);

namespace NasTech\Messaging;

use NasTech\SharedKernel\Persistence\Store;

/**
 * The model of the database the tests run against.
 *
 * It enforces the two things that make the append-only and CAS claims true rather
 * than aspirational: InMemoryStore refuses an UPDATE on messages/attachments/
 * reports/flags, and every write that can race compares the stored version. The
 * SQL implementation carries the same rules down to PostgreSQL; the migration is
 * the version that has to be proven against a real server.
 */
final class InMemoryMessagingRepository implements MessagingRepository
{
    private const THREADS = 'messaging_threads';
    private const MESSAGES = 'messaging_messages';
    private const ATTACHMENTS = 'messaging_message_attachments';
    private const FLAGS = 'messaging_contact_flags';
    private const REPORTS = 'messaging_thread_reports';
    private const READ_STATE = 'messaging_read_state';
    private const BLOCKS = 'messaging_contact_blocks';

    public function __construct(private readonly Store $store)
    {
    }

    public function insertThread(Thread $thread): void
    {
        $this->store->insert(self::THREADS, $thread->toArray());
    }

    public function saveThread(Thread $thread, int $expectedVersion): void
    {
        $stored = $this->store->find(self::THREADS, $thread->id);
        if ($stored === null) {
            throw new ThreadNotFound("Unknown thread {$thread->id}");
        }
        $storedVersion = (int) $stored['version'];
        if ($storedVersion !== $expectedVersion) {
            throw new StaleThreadVersion($thread->id, $expectedVersion, $storedVersion);
        }
        if ($thread->version() <= $storedVersion) {
            throw new \DomainException(
                "Thread {$thread->id} saved at version {$thread->version()}, which does not advance {$storedVersion}"
            );
        }
        $this->store->update(self::THREADS, $thread->toArray());
    }

    public function findThread(string $id): ?Thread
    {
        $row = $this->store->find(self::THREADS, $id);

        return $row === null ? null : Thread::fromRow($row);
    }

    public function findThreadByContext(string $contextKey, string $buyerId, string $sellerId): ?Thread
    {
        foreach ($this->store->all(self::THREADS) as $row) {
            if ($row['context_key'] === $contextKey
                && $row['buyer_id'] === $buyerId
                && $row['seller_id'] === $sellerId) {
                return Thread::fromRow($row);
            }
        }

        return null;
    }

    public function threadsForParticipant(string $accountId, ?string $cursor, int $limit): array
    {
        $rows = [];
        foreach ($this->store->all(self::THREADS) as $row) {
            if ($row['buyer_id'] !== $accountId && $row['seller_id'] !== $accountId) {
                continue;
            }
            if ($cursor !== null && (string) $row['activity_key'] >= $cursor) {
                continue;
            }
            $rows[] = $row;
        }

        usort($rows, static function (array $a, array $b): int {
            return strcmp((string) $b['activity_key'], (string) $a['activity_key'])
                ?: strcmp((string) $a['id'], (string) $b['id']);
        });

        return array_map(
            static fn (array $row): Thread => Thread::fromRow($row),
            array_slice($rows, 0, $limit),
        );
    }

    public function appendMessage(Message $message, array $attachments): void
    {
        $this->store->insert(self::MESSAGES, $message->toArray());
        foreach ($attachments as $attachment) {
            $this->store->insert(self::ATTACHMENTS, $attachment->toRow($message->id));
        }
    }

    public function findMessage(string $id): ?Message
    {
        $row = $this->store->find(self::MESSAGES, $id);

        return $row === null ? null : Message::fromRow($row, $this->attachmentsFor($id));
    }

    public function findMessageByClientId(string $threadId, string $senderId, string $clientMessageId): ?Message
    {
        foreach ($this->store->all(self::MESSAGES) as $row) {
            if ($row['thread_id'] === $threadId
                && $row['sender_id'] === $senderId
                && $row['client_message_id'] === $clientMessageId) {
                return Message::fromRow($row, $this->attachmentsFor((string) $row['id']));
            }
        }

        return null;
    }

    public function allMessages(string $threadId): array
    {
        $rows = array_values(array_filter(
            $this->store->all(self::MESSAGES),
            static fn (array $row): bool => $row['thread_id'] === $threadId,
        ));
        usort($rows, static fn (array $a, array $b): int => (int) $a['sequence'] <=> (int) $b['sequence']);

        return array_map(
            fn (array $row): Message => Message::fromRow($row, $this->attachmentsFor((string) $row['id'])),
            $rows,
        );
    }

    public function messagesAfter(string $threadId, int $afterSequence, int $limit): array
    {
        $rows = [];
        foreach ($this->allMessages($threadId) as $message) {
            if ($message->sequence > $afterSequence) {
                $rows[] = $message;
            }
            if (count($rows) >= $limit) {
                break;
            }
        }

        return $rows;
    }

    public function appendFlags(array $flagRows): void
    {
        foreach ($flagRows as $row) {
            $this->store->insert(self::FLAGS, $row);
        }
    }

    public function insertReport(ThreadReport $report): void
    {
        $this->store->insert(self::REPORTS, $report->toArray());
    }

    public function findReadState(string $threadId, string $readerId, string $deviceId): ?array
    {
        foreach ($this->store->all(self::READ_STATE) as $row) {
            if ($row['thread_id'] === $threadId
                && $row['reader_id'] === $readerId
                && $row['device_id'] === $deviceId) {
                return $row;
            }
        }

        return null;
    }

    public function putReadState(array $row, int $expectedVersion): void
    {
        $existing = $this->findReadState(
            (string) $row['thread_id'],
            (string) $row['reader_id'],
            (string) $row['device_id'],
        );
        $actual = $existing === null ? 0 : (int) $existing['version'];
        if ($actual !== $expectedVersion) {
            throw new StaleReadVersion(
                (string) $row['thread_id'],
                (string) $row['device_id'],
                $expectedVersion,
                $actual,
            );
        }
        if ($existing === null) {
            $this->store->insert(self::READ_STATE, $row);

            return;
        }
        if ((int) $row['version'] <= $actual) {
            throw new \DomainException('A read-state version must advance; a cursor never moves backwards');
        }
        $this->store->update(self::READ_STATE, $row);
    }

    public function findBlock(string $blockerId, string $blockedId): ?ContactBlock
    {
        foreach ($this->store->all(self::BLOCKS) as $row) {
            if ($row['blocker_id'] === $blockerId && $row['blocked_id'] === $blockedId && (bool) $row['active']) {
                return ContactBlock::fromRow($row);
            }
        }

        return null;
    }

    public function findBlockBySourceEvent(string $sourceEventId): ?ContactBlock
    {
        foreach ($this->store->all(self::BLOCKS) as $row) {
            if ($row['source_event_id'] === $sourceEventId) {
                return ContactBlock::fromRow($row);
            }
        }

        return null;
    }

    public function findBlockByReleaseEvent(string $releaseEventId): ?ContactBlock
    {
        foreach ($this->store->all(self::BLOCKS) as $row) {
            if (($row['release_event_id'] ?? null) === $releaseEventId) {
                return ContactBlock::fromRow($row);
            }
        }

        return null;
    }

    public function insertBlock(ContactBlock $block): void
    {
        $this->store->insert(self::BLOCKS, $block->toArray());
    }

    public function saveBlock(ContactBlock $block): void
    {
        $this->store->update(self::BLOCKS, $block->toArray());
    }

    public function isBlockedEitherWay(string $a, string $b): bool
    {
        return $this->findBlock($a, $b) !== null || $this->findBlock($b, $a) !== null;
    }

    public function blocksFiledBy(string $blockerId): array
    {
        $blocks = [];
        foreach ($this->store->all(self::BLOCKS) as $row) {
            if ($row['blocker_id'] === $blockerId) {
                $blocks[] = ContactBlock::fromRow($row);
            }
        }

        return $blocks;
    }

    /**
     * @return list<MessageAttachment>
     */
    private function attachmentsFor(string $messageId): array
    {
        $attachments = [];
        foreach ($this->store->all(self::ATTACHMENTS) as $row) {
            if ($row['message_id'] !== $messageId) {
                continue;
            }
            $attachments[] = new MessageAttachment(
                (string) $row['media_id'],
                (string) $row['kind'],
                (int) $row['position'],
            );
        }
        usort($attachments, static fn (MessageAttachment $a, MessageAttachment $b): int => $a->position <=> $b->position);

        return $attachments;
    }
}
