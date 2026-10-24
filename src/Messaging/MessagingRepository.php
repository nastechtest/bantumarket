<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * Messaging's persistence port.
 *
 * One port for the module's four record types rather than four repositories,
 * because a send writes a thread row, a message row, attachment rows and flag
 * rows as one unit: splitting them across ports would invite a caller to write
 * three of the four. The in-memory implementation runs the tests; the SQL
 * implementation emits the statements production will run, and neither the
 * service nor the domain knows which one is in play.
 */
interface MessagingRepository
{
    public function insertThread(Thread $thread): void;

    /**
     * @throws StaleThreadVersion when the stored version is not the expected one
     */
    public function saveThread(Thread $thread, int $expectedVersion): void;

    public function findThread(string $id): ?Thread;

    public function findThreadByContext(string $contextKey, string $buyerId, string $sellerId): ?Thread;

    /**
     * Inbox order: most recently active first. Cursor is the opaque activity key
     * of the last row returned, or null for the first page.
     *
     * @return list<Thread>
     */
    public function threadsForParticipant(string $accountId, ?string $cursor, int $limit): array;

    /**
     * @param list<MessageAttachment> $attachments
     */
    public function appendMessage(Message $message, array $attachments): void;

    public function findMessage(string $id): ?Message;

    public function findMessageByClientId(string $threadId, string $senderId, string $clientMessageId): ?Message;

    /**
     * @return list<Message> ascending sequence, every version
     */
    public function allMessages(string $threadId): array;

    /**
     * @return list<Message> ascending sequence, raw versions from a cursor
     */
    public function messagesAfter(string $threadId, int $afterSequence, int $limit): array;

    /**
     * @param list<array<string,mixed>> $flagRows
     */
    public function appendFlags(array $flagRows): void;

    public function insertReport(ThreadReport $report): void;

    /**
     * @return array<string,mixed>|null the raw read-state row
     */
    public function findReadState(string $threadId, string $readerId, string $deviceId): ?array;

    /**
     * @param array<string,mixed> $row
     */
    public function putReadState(array $row, int $expectedVersion): void;

    public function findBlock(string $blockerId, string $blockedId): ?ContactBlock;

    public function findBlockBySourceEvent(string $sourceEventId): ?ContactBlock;

    public function findBlockByReleaseEvent(string $releaseEventId): ?ContactBlock;

    public function insertBlock(ContactBlock $block): void;

    public function saveBlock(ContactBlock $block): void;

    public function isBlockedEitherWay(string $a, string $b): bool;

    /**
     * Every block a person has filed, active or released. Used by the buyer's own
     * block list; the seller's surface never sees it.
     *
     * @return list<ContactBlock>
     */
    public function blocksFiledBy(string $blockerId): array;
}
