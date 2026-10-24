<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * Events Messaging puts on the transactional outbox.
 *
 * The rule that shapes every payload here: a message body, a phone number, an email
 * address or a street address never appears in an event. Not because consumers are
 * untrusted, but because an event is copied into the outbox, the consumer's store,
 * its logs and its retries — four copies of a contact detail the module was asked
 * to protect. Consumers that need the text (the thread UI) are already parties and
 * call FetchMessages.
 *
 * MessageSent carries the recipient so Notifications can say "come and look"
 * without reading Messaging's schema.
 */
final class MessagingEvents
{
    public const AGGREGATE_TYPE = 'Messaging';

    public const THREAD_OPENED = 'ThreadOpened';
    public const MESSAGE_SENT = 'MessageSent';
    public const MESSAGE_EDITED = 'MessageEdited';
    public const MESSAGE_DELETED = 'MessageDeleted';
    public const CONTACT_EXCHANGE_FLAGGED = 'ContactExchangeFlagged';
    public const THREAD_REPORTED = 'ThreadReported';
    public const THREAD_CLOSED = 'ThreadClosed';
    public const THREAD_ACCESSED_FOR_AUDIT = 'ThreadAccessedForAudit';

    /** @return list<string> */
    public static function names(): array
    {
        return [
            self::THREAD_OPENED,
            self::MESSAGE_SENT,
            self::MESSAGE_EDITED,
            self::MESSAGE_DELETED,
            self::CONTACT_EXCHANGE_FLAGGED,
            self::THREAD_REPORTED,
            self::THREAD_CLOSED,
            self::THREAD_ACCESSED_FOR_AUDIT,
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public static function threadOpened(Thread $thread): array
    {
        return [
            'thread_id' => $thread->id,
            'buyer_id' => $thread->buyerId,
            'seller_id' => $thread->sellerId,
            'listing_id' => $thread->listingId,
            'order_id' => $thread->orderId,
            'opened_at' => $thread->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public static function messageSent(Message $message, string $recipientId): array
    {
        return [
            'message_id' => $message->id,
            'thread_id' => $message->threadId,
            'sequence' => $message->sequence,
            'sender_id' => $message->senderId,
            'recipient_id' => $recipientId,
            'attachment_count' => count($message->attachments),
            'sent_at' => $message->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public static function messageEdited(Message $edit): array
    {
        return [
            'message_id' => $edit->id,
            'thread_id' => $edit->threadId,
            'sequence' => $edit->sequence,
            'supersedes_id' => $edit->supersedesId,
            'edited_at' => $edit->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public static function messageDeleted(Message $tombstone): array
    {
        return [
            'message_id' => $tombstone->id,
            'thread_id' => $tombstone->threadId,
            'sequence' => $tombstone->sequence,
            'supersedes_id' => $tombstone->supersedesId,
            'deleted_at' => $tombstone->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @param list<SafetyFinding> $findings
     * @return array<string,mixed>
     */
    public static function contactExchangeFlagged(
        Thread $thread,
        Message $message,
        string $recipientId,
        array $findings,
        \DateTimeImmutable $at,
    ): array {
        return [
            'thread_id' => $thread->id,
            'message_id' => $message->id,
            'sequence' => $message->sequence,
            'sender_id' => $message->senderId,
            'recipient_id' => $recipientId,
            'findings' => array_map(
                static fn (SafetyFinding $finding): array => $finding->toEventPayload(),
                $findings,
            ),
            'flagged_at' => $at->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public static function threadReported(ThreadReport $report): array
    {
        return [
            'report_id' => $report->id,
            'thread_id' => $report->threadId,
            'reporter_id' => $report->reporterId,
            'reason' => $report->reason->value,
            'reported_at' => $report->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public static function threadClosed(Thread $thread): array
    {
        return [
            'thread_id' => $thread->id,
            'reason' => $thread->closedReason(),
            'closed_at' => $thread->closedAt()?->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * An audit read is itself a fact the auditor must be able to see later.
     *
     * @return array<string,mixed>
     */
    public static function threadAccessedForAudit(
        Thread $thread,
        string $actorId,
        string $capability,
        string $caseId,
        string $reason,
        \DateTimeImmutable $at,
    ): array {
        return [
            'thread_id' => $thread->id,
            'actor_id' => $actorId,
            'capability' => $capability,
            'case_id' => $caseId,
            'reason' => $reason,
            'accessed_at' => $at->format(\DateTimeInterface::ATOM),
        ];
    }
}
