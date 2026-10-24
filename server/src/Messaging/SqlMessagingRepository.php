<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * The PostgreSQL implementation of MessagingRepository: parameterised SQL, CAS
 * predicates in the WHERE clause, and `RETURNING version` so a lost race is an
 * exception rather than a silent overwrite.
 *
 * Not executed in this environment (no PDO, no server). tests/Messaging/
 * SqlMessagingRepositoryTest asserts the statement shapes against the migration;
 * the behaviour tests run on the in-memory model. Both are needed and neither is
 * a substitute for `psql`.
 */
final class SqlMessagingRepository implements MessagingRepository
{
    public function __construct(private readonly SqlExecutor $executor)
    {
    }

    public function insertThread(Thread $thread): void
    {
        $row = $thread->toArray();
        $this->executor->execute(new SqlStatement(
            'INSERT INTO messaging.threads (id, context_key, listing_id, order_id, buyer_id, seller_id, status, message_count, version, created_at, last_message_at, closed_at, closed_reason, activity_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
            [
                $row['id'], $row['context_key'], $row['listing_id'], $row['order_id'],
                $row['buyer_id'], $row['seller_id'], $row['status'], $row['message_count'],
                $row['version'], $row['created_at'], $row['last_message_at'], $row['closed_at'],
                $row['closed_reason'], $row['activity_key'],
            ],
        ));
    }

    public function saveThread(Thread $thread, int $expectedVersion): void
    {
        $row = $thread->toArray();
        $updated = $this->executor->execute(new SqlStatement(
            'UPDATE messaging.threads
                SET status = $1, message_count = $2, version = $3, last_message_at = $4,
                    closed_at = $5, closed_reason = $6, activity_key = $7
              WHERE id = $8 AND version = $9
          RETURNING version',
            [
                $row['status'], $row['message_count'], $row['version'], $row['last_message_at'],
                $row['closed_at'], $row['closed_reason'], $row['activity_key'],
                $thread->id, $expectedVersion,
            ],
            true,
        ));
        if ($updated === []) {
            $current = $this->executor->execute(SqlStatement::selecting(
                'SELECT version FROM messaging.threads WHERE id = $1',
                [$thread->id],
            ));
            $actual = $current === [] ? -1 : (int) $current[0]['version'];
            throw new StaleThreadVersion($thread->id, $expectedVersion, $actual);
        }
    }

    public function findThread(string $id): ?Thread
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT id, context_key, listing_id, order_id, buyer_id, seller_id, status, message_count, version, created_at, last_message_at, closed_at, closed_reason, activity_key
               FROM messaging.threads WHERE id = $1',
            [$id],
        ));

        return $rows === [] ? null : Thread::fromRow($rows[0]);
    }

    public function findThreadByContext(string $contextKey, string $buyerId, string $sellerId): ?Thread
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT id, context_key, listing_id, order_id, buyer_id, seller_id, status, message_count, version, created_at, last_message_at, closed_at, closed_reason, activity_key
               FROM messaging.threads
              WHERE context_key = $1 AND buyer_id = $2 AND seller_id = $3',
            [$contextKey, $buyerId, $sellerId],
        ));

        return $rows === [] ? null : Thread::fromRow($rows[0]);
    }

    public function threadsForParticipant(string $accountId, ?string $cursor, int $limit): array
    {
        $sql = 'SELECT id, context_key, listing_id, order_id, buyer_id, seller_id, status, message_count, version, created_at, last_message_at, closed_at, closed_reason, activity_key
                  FROM messaging.threads
                 WHERE (buyer_id = $1 OR seller_id = $1)';
        $params = [$accountId];
        if ($cursor !== null) {
            $sql .= ' AND activity_key < $3';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY activity_key DESC, id ASC LIMIT $2';
        $params[] = $limit;

        // $2 is the limit regardless of whether the cursor occupied $3.
        if ($cursor !== null) {
            $params = [$accountId, $limit, $cursor];
        }

        $rows = $this->executor->execute(SqlStatement::selecting($sql, $params));

        return array_map(static fn (array $row): Thread => Thread::fromRow($row), $rows);
    }

    public function appendMessage(Message $message, array $attachments): void
    {
        $row = $message->toArray();
        $this->executor->execute(new SqlStatement(
            'INSERT INTO messaging.messages (id, thread_id, sequence, sender_id, kind, body, body_digest, supersedes_id, client_message_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
            [
                $row['id'], $row['thread_id'], $row['sequence'], $row['sender_id'], $row['kind'],
                $row['body'], $row['body_digest'], $row['supersedes_id'], $row['client_message_id'],
                $row['created_at'],
            ],
        ));
        foreach ($attachments as $attachment) {
            $attachmentRow = $attachment->toRow($message->id);
            $this->executor->execute(new SqlStatement(
                'INSERT INTO messaging.message_attachments (id, message_id, media_id, kind, position)
                 VALUES ($1, $2, $3, $4, $5)',
                [
                    $attachmentRow['id'], $attachmentRow['message_id'], $attachmentRow['media_id'],
                    $attachmentRow['kind'], $attachmentRow['position'],
                ],
            ));
        }
    }

    public function findMessage(string $id): ?Message
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT id, thread_id, sequence, sender_id, kind, body, body_digest, supersedes_id, client_message_id, created_at
               FROM messaging.messages WHERE id = $1',
            [$id],
        ));

        return $rows === [] ? null : Message::fromRow($rows[0], $this->attachmentsFor($id));
    }

    public function findMessageByClientId(string $threadId, string $senderId, string $clientMessageId): ?Message
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT id, thread_id, sequence, sender_id, kind, body, body_digest, supersedes_id, client_message_id, created_at
               FROM messaging.messages
              WHERE thread_id = $1 AND sender_id = $2 AND client_message_id = $3',
            [$threadId, $senderId, $clientMessageId],
        ));

        return $rows === [] ? null : Message::fromRow($rows[0], $this->attachmentsFor((string) $rows[0]['id']));
    }

    public function allMessages(string $threadId): array
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT id, thread_id, sequence, sender_id, kind, body, body_digest, supersedes_id, client_message_id, created_at
               FROM messaging.messages WHERE thread_id = $1 ORDER BY sequence ASC',
            [$threadId],
        ));

        return array_map(
            fn (array $row): Message => Message::fromRow($row, $this->attachmentsFor((string) $row['id'])),
            $rows,
        );
    }

    public function messagesAfter(string $threadId, int $afterSequence, int $limit): array
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT id, thread_id, sequence, sender_id, kind, body, body_digest, supersedes_id, client_message_id, created_at
               FROM messaging.messages
              WHERE thread_id = $1 AND sequence > $2
              ORDER BY sequence ASC LIMIT $3',
            [$threadId, $afterSequence, $limit],
        ));

        return array_map(
            fn (array $row): Message => Message::fromRow($row, $this->attachmentsFor((string) $row['id'])),
            $rows,
        );
    }

    public function appendFlags(array $flagRows): void
    {
        foreach ($flagRows as $row) {
            $this->executor->execute(new SqlStatement(
                'INSERT INTO messaging.contact_flags (id, thread_id, message_id, category, rule_id, risk, confidence, matched_text, detected_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                [
                    $row['id'], $row['thread_id'], $row['message_id'], $row['category'],
                    $row['rule_id'], $row['risk'], $row['confidence'], $row['matched_text'],
                    $row['detected_at'],
                ],
            ));
        }
    }

    public function insertReport(ThreadReport $report): void
    {
        $row = $report->toArray();
        $this->executor->execute(new SqlStatement(
            'INSERT INTO messaging.thread_reports (id, thread_id, reporter_id, reason, details, message_sequence, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [
                $row['id'], $row['thread_id'], $row['reporter_id'], $row['reason'],
                $row['details'], $row['message_sequence'], $row['created_at'],
            ],
        ));
    }

    public function findReadState(string $threadId, string $readerId, string $deviceId): ?array
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT id, thread_id, reader_id, device_id, last_read_sequence, version, updated_at
               FROM messaging.read_state
              WHERE thread_id = $1 AND reader_id = $2 AND device_id = $3',
            [$threadId, $readerId, $deviceId],
        ));

        return $rows === [] ? null : $rows[0];
    }

    public function putReadState(array $row, int $expectedVersion): void
    {
        if ($expectedVersion === 0) {
            $this->executor->execute(new SqlStatement(
                'INSERT INTO messaging.read_state (id, thread_id, reader_id, device_id, last_read_sequence, version, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [
                    $row['id'], $row['thread_id'], $row['reader_id'], $row['device_id'],
                    $row['last_read_sequence'], $row['version'], $row['updated_at'],
                ],
            ));

            return;
        }
        $updated = $this->executor->execute(new SqlStatement(
            'UPDATE messaging.read_state
                SET last_read_sequence = $1, version = $2, updated_at = $3
              WHERE id = $4 AND version = $5
          RETURNING version',
            [
                $row['last_read_sequence'], $row['version'], $row['updated_at'],
                $row['id'], $expectedVersion,
            ],
            true,
        ));
        if ($updated === []) {
            $current = $this->executor->execute(SqlStatement::selecting(
                'SELECT version FROM messaging.read_state WHERE id = $1',
                [$row['id']],
            ));
            $actual = $current === [] ? 0 : (int) $current[0]['version'];
            throw new StaleReadVersion(
                (string) $row['thread_id'],
                (string) $row['device_id'],
                $expectedVersion,
                $actual,
            );
        }
    }

    public function findBlock(string $blockerId, string $blockedId): ?ContactBlock
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT id, blocker_id, blocked_id, reason, source_event_id, active, created_at, released_at, release_event_id
               FROM messaging.contact_blocks
              WHERE blocker_id = $1 AND blocked_id = $2 AND active = true',
            [$blockerId, $blockedId],
        ));

        return $rows === [] ? null : ContactBlock::fromRow($rows[0]);
    }

    public function findBlockBySourceEvent(string $sourceEventId): ?ContactBlock
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT id, blocker_id, blocked_id, reason, source_event_id, active, created_at, released_at, release_event_id
               FROM messaging.contact_blocks WHERE source_event_id = $1',
            [$sourceEventId],
        ));

        return $rows === [] ? null : ContactBlock::fromRow($rows[0]);
    }

    public function findBlockByReleaseEvent(string $releaseEventId): ?ContactBlock
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT id, blocker_id, blocked_id, reason, source_event_id, active, created_at, released_at, release_event_id
               FROM messaging.contact_blocks WHERE release_event_id = $1',
            [$releaseEventId],
        ));

        return $rows === [] ? null : ContactBlock::fromRow($rows[0]);
    }

    public function insertBlock(ContactBlock $block): void
    {
        $row = $block->toArray();
        $this->executor->execute(new SqlStatement(
            'INSERT INTO messaging.contact_blocks (id, blocker_id, blocked_id, reason, source_event_id, active, created_at, released_at, release_event_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [
                $row['id'], $row['blocker_id'], $row['blocked_id'], $row['reason'],
                $row['source_event_id'], $row['active'], $row['created_at'],
                $row['released_at'], $row['release_event_id'],
            ],
        ));
    }

    public function saveBlock(ContactBlock $block): void
    {
        $row = $block->toArray();
        $this->executor->execute(new SqlStatement(
            'UPDATE messaging.contact_blocks
                SET active = $1, released_at = $2, release_event_id = $3
              WHERE id = $4',
            [$row['active'], $row['released_at'], $row['release_event_id'], $row['id']],
        ));
    }

    public function isBlockedEitherWay(string $a, string $b): bool
    {
        return $this->findBlock($a, $b) !== null || $this->findBlock($b, $a) !== null;
    }

    public function blocksFiledBy(string $blockerId): array
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT id, blocker_id, blocked_id, reason, source_event_id, active, created_at, released_at, release_event_id
               FROM messaging.contact_blocks WHERE blocker_id = $1 ORDER BY created_at DESC',
            [$blockerId],
        ));

        return array_map(static fn (array $row): ContactBlock => ContactBlock::fromRow($row), $rows);
    }

    /**
     * @return list<MessageAttachment>
     */
    private function attachmentsFor(string $messageId): array
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT media_id, kind, position FROM messaging.message_attachments
              WHERE message_id = $1 ORDER BY position ASC',
            [$messageId],
        ));

        return array_map(
            static fn (array $row): MessageAttachment => new MessageAttachment(
                (string) $row['media_id'],
                (string) $row['kind'],
                (int) $row['position'],
            ),
            $rows,
        );
    }
}
