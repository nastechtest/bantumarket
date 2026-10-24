<?php

declare(strict_types=1);

namespace NasTech\Messaging;

use NasTech\Identity\AccountRepository;
use NasTech\Identity\Authorisation;
use NasTech\Identity\Capability;
use NasTech\SharedKernel\AuditSink\AuditRecord;
use NasTech\SharedKernel\AuditSink\AuditSink;
use NasTech\SharedKernel\AuditSink\NullAuditSink;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Messaging's public surface. The HTTP layer dispatches these methods and nothing
 * below them; Application\Kernel wires the collaborators.
 *
 * Every write is one transaction containing the state change and its outbox rows.
 * Every read that returns message content re-checks participation, because a thread
 * is visible only to its two parties and a fetch is where that promise is kept or
 * broken — not at thread creation.
 */
final class MessagingService
{
    public const MAX_PAGE = 100;
    public const DEFAULT_PAGE = 50;

    private ContactSafetyScanner $scanner;
    private AuditSink $audit;

    public function __construct(
        private readonly MessagingRepository $repository,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
        private readonly AccountRepository $accounts,
        private readonly Authorisation $authorisation,
        ?ContactSafetyScanner $scanner = null,
        ?AuditSink $audit = null,
    ) {
        $this->scanner = $scanner ?? new ContactSafetyScanner();
        $this->audit = $audit ?? new NullAuditSink();
    }

    /**
     * Open or return the thread for one listing/order between two accounts.
     *
     * Idempotent by unique index, not by a read-then-write: two taps on "message
     * seller" race, and the loser of the insert gets the winner's thread rather than
     * a second conversation nobody can find.
     */
    public function openThread(
        string $actorId,
        string $buyerId,
        string $sellerId,
        ?string $listingId,
        ?string $orderId,
    ): Thread {
        if ($actorId !== $buyerId && $actorId !== $sellerId) {
            throw new MessageRefused('The account opening a thread must be one of its two parties');
        }
        $this->authorisation->require($buyerId, Capability::MESSAGING_SEND);
        $this->authorisation->require($sellerId, Capability::MESSAGING_SEND);
        if ($this->repository->isBlockedEitherWay($buyerId, $sellerId)) {
            throw new ContactBlocked('new');
        }

        $contextKey = $orderId !== null ? 'order:' . $orderId : 'listing:' . (string) $listingId;
        $existing = $this->repository->findThreadByContext($contextKey, $buyerId, $sellerId);
        if ($existing !== null) {
            return $existing;
        }

        $thread = Thread::open(
            Id::generate('thr')->value(),
            $buyerId,
            $sellerId,
            $listingId,
            $orderId,
            $this->clock->now(),
        );

        $this->uow->begin();
        try {
            $this->repository->insertThread($thread);
            $this->outbox->publish(
                MessagingEvents::AGGREGATE_TYPE,
                $thread->id,
                MessagingEvents::THREAD_OPENED,
                MessagingEvents::threadOpened($thread),
            );
            $this->uow->commit();
        } catch (UniqueConstraintViolation $race) {
            $this->uow->rollback();
            $winner = $this->repository->findThreadByContext($contextKey, $buyerId, $sellerId);
            if ($winner !== null) {
                return $winner;
            }

            throw $race;
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $thread;
    }

    /**
     * @param list<array{media_id: string, kind: string, position: int}> $attachments
     */
    public function sendMessage(
        string $threadId,
        string $senderId,
        string $body,
        string $clientMessageId,
        array $attachments = [],
    ): Message {
        $this->authorisation->require($senderId, Capability::MESSAGING_SEND);
        $thread = $this->requireThread($threadId);
        $thread->requireParty($senderId);
        if ($this->repository->isBlockedEitherWay($thread->buyerId, $thread->sellerId)) {
            throw new ContactBlocked($threadId);
        }
        $recipient = $thread->peerOf($senderId);
        if (!$this->authorisation->can($recipient, Capability::MESSAGING_SEND)) {
            throw new MessageRefused('The other party cannot receive messages right now; the send is refused rather than silently stored');
        }

        $existing = $this->repository->findMessageByClientId($threadId, $senderId, $clientMessageId);
        if ($existing !== null) {
            return $existing;
        }

        $messageBody = MessageBody::fromText($body);
        $attachmentList = MessageAttachment::listFromRaw($attachments);
        $findings = $this->scanner->scan($messageBody->text);
        $now = $this->clock->now();

        $this->uow->begin();
        try {
            $sequence = $thread->recordMessage($now);
            $message = Message::say(
                Id::generate('msg')->value(),
                $threadId,
                $sequence,
                $senderId,
                $messageBody,
                $clientMessageId,
                $now,
                $attachmentList,
            );
            $this->repository->appendMessage($message, $attachmentList);
            if ($findings !== []) {
                $this->repository->appendFlags(array_map(
                    static fn (SafetyFinding $finding): array => $finding->toRow($threadId, $message->id, $now),
                    $findings,
                ));
            }
            $this->repository->saveThread($thread, $thread->version() - 1);
            $this->outbox->publish(
                MessagingEvents::AGGREGATE_TYPE,
                $threadId,
                MessagingEvents::MESSAGE_SENT,
                MessagingEvents::messageSent($message, $recipient),
            );
            if (ContactSafetyScanner::shouldRaiseEvent($findings)) {
                $this->outbox->publish(
                    MessagingEvents::AGGREGATE_TYPE,
                    $threadId,
                    MessagingEvents::CONTACT_EXCHANGE_FLAGGED,
                    MessagingEvents::contactExchangeFlagged($thread, $message, $recipient, $findings, $now),
                );
            }
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $message;
    }

    /**
     * @param list<array{media_id: string, kind: string, position: int}> $attachments
     */
    public function editMessage(
        string $messageId,
        string $actorId,
        string $newBody,
        string $clientMessageId,
        array $attachments = [],
    ): Message {
        $this->authorisation->require($actorId, Capability::MESSAGING_SEND);
        $previous = $this->repository->findMessage($messageId);
        if ($previous === null) {
            throw new MessageRefused('Unknown message: ' . $messageId);
        }
        $previous->requireAuthor($actorId);
        $thread = $this->requireThread($previous->threadId);
        $thread->requireParty($actorId);
        $body = MessageBody::fromText($newBody);
        $attachmentList = MessageAttachment::listFromRaw($attachments);
        $now = $this->clock->now();

        $this->uow->begin();
        try {
            $sequence = $thread->recordMessage($now);
            $edit = Message::edit(
                $previous,
                Id::generate('msg')->value(),
                $sequence,
                $body,
                $clientMessageId,
                $now,
                $attachmentList,
            );
            $this->repository->appendMessage($edit, $attachmentList);
            $this->repository->saveThread($thread, $thread->version() - 1);
            $this->outbox->publish(
                MessagingEvents::AGGREGATE_TYPE,
                $thread->id,
                MessagingEvents::MESSAGE_EDITED,
                MessagingEvents::messageEdited($edit),
            );
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $edit;
    }

    public function deleteMessage(string $messageId, string $actorId, string $clientMessageId): Message
    {
        $this->authorisation->require($actorId, Capability::MESSAGING_SEND);
        $previous = $this->repository->findMessage($messageId);
        if ($previous === null) {
            throw new MessageRefused('Unknown message: ' . $messageId);
        }
        $previous->requireAuthor($actorId);
        $thread = $this->requireThread($previous->threadId);
        $thread->requireParty($actorId);
        $now = $this->clock->now();

        $this->uow->begin();
        try {
            $sequence = $thread->recordMessage($now);
            $tombstone = Message::tombstone(
                $previous,
                Id::generate('msg')->value(),
                $sequence,
                $clientMessageId,
                $now,
            );
            $this->repository->appendMessage($tombstone, []);
            $this->repository->saveThread($thread, $thread->version() - 1);
            $this->outbox->publish(
                MessagingEvents::AGGREGATE_TYPE,
                $thread->id,
                MessagingEvents::MESSAGE_DELETED,
                MessagingEvents::messageDeleted($tombstone),
            );
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $tombstone;
    }

    /**
     * Move one device's read cursor. The expected version is the caller's view of
     * its own device row, so a second device cannot advance the first one's cursor
     * and a stale tab cannot move a cursor backwards.
     *
     * @return array<string,mixed>
     */
    public function markRead(
        string $threadId,
        string $readerId,
        string $deviceId,
        int $upToSequence,
        int $expectedVersion,
    ): array {
        if (!preg_match('/^[A-Za-z0-9_\-]{4,64}$/', $deviceId)) {
            throw new MessageRefused('A device id is 4–64 url-safe characters and identifies one installation');
        }
        $thread = $this->requireThread($threadId);
        $thread->requireParty($readerId);
        if ($upToSequence < 0 || $upToSequence > $thread->messageCount()) {
            throw new MessageRefused('A read cursor points at a message this thread has');
        }

        $existing = $this->repository->findReadState($threadId, $readerId, $deviceId);
        $currentVersion = $existing === null ? 0 : (int) $existing['version'];
        if ($expectedVersion !== $currentVersion) {
            throw new StaleReadVersion($threadId, $deviceId, $expectedVersion, $currentVersion);
        }
        if ($existing !== null && $upToSequence < (int) $existing['last_read_sequence']) {
            throw new MessageRefused('A read cursor never moves backwards; pass the higher sequence');
        }

        $row = [
            'id' => $existing === null ? Id::generate('rds')->value() : (string) $existing['id'],
            'thread_id' => $threadId,
            'reader_id' => $readerId,
            'device_id' => $deviceId,
            'last_read_sequence' => $upToSequence,
            'version' => $currentVersion + 1,
            'updated_at' => $this->clock->now()->format(\DateTimeInterface::ATOM),
        ];

        $this->uow->begin();
        try {
            $this->repository->putReadState($row, $currentVersion);
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $row;
    }

    public function fetchMessages(
        string $threadId,
        string $readerId,
        ?int $cursorSequence = null,
        int $limit = self::DEFAULT_PAGE,
    ): MessagePage {
        $thread = $this->requireThread($threadId);
        $thread->requireParty($readerId);
        $limit = max(1, min(self::MAX_PAGE, $limit));

        $folded = MessageVersionChain::fold($this->repository->allMessages($threadId));
        $selected = [];
        $next = null;
        foreach ($folded as $entry) {
            if ($cursorSequence !== null && $entry['first_sequence'] <= $cursorSequence) {
                continue;
            }
            $selected[] = $entry['message'];
            if (count($selected) === $limit) {
                $next = $entry['first_sequence'];
                break;
            }
        }
        if ($next !== null) {
            $more = false;
            foreach ($folded as $entry) {
                if ($entry['first_sequence'] > $next) {
                    $more = true;
                    break;
                }
            }
            if (!$more) {
                $next = null;
            }
        }

        return new MessagePage($threadId, $selected, $next);
    }

    /**
     * The inbox. New messages are pulled; Notifications only says "come and look".
     *
     * @return array{threads: list<array<string,mixed>>, next_cursor: ?string}
     */
    public function fetchThreads(string $accountId, ?string $cursor = null, int $limit = self::DEFAULT_PAGE): array
    {
        $this->authorisation->require($accountId, Capability::MESSAGING_SEND);
        $limit = max(1, min(self::MAX_PAGE, $limit));
        $threads = $this->repository->threadsForParticipant($accountId, $cursor, $limit);

        $summaries = [];
        foreach ($threads as $thread) {
            $summary = $thread->toSummary();
            $summary['counterparty_id'] = $thread->peerOf($accountId);
            $summaries[] = $summary;
        }

        return [
            'threads' => $summaries,
            'next_cursor' => count($threads) === $limit ? $threads[count($threads) - 1]->activityKey() : null,
        ];
    }

    /**
     * The participant's own export. Every version, including rows a delete hid, is
     * returned and labelled: "deleted" in an export is a fact, not an omission.
     *
     * @return list<array<string,mixed>>
     */
    public function exportThread(string $threadId, string $readerId): array
    {
        $thread = $this->requireThread($threadId);
        $thread->requireParty($readerId);

        return MessageVersionChain::export($this->repository->allMessages($threadId));
    }

    public function reportThread(
        string $threadId,
        string $reporterId,
        ThreadReportReason $reason,
        ?string $details,
        ?int $messageSequence = null,
    ): ThreadReport {
        $thread = $this->requireThread($threadId);
        $thread->requireParty($reporterId);
        if ($messageSequence !== null && $messageSequence > $thread->messageCount()) {
            throw new MessageRefused('The reported message sequence is not in this thread');
        }
        $report = ThreadReport::file(
            Id::generate('rpt')->value(),
            $threadId,
            $reporterId,
            $reason,
            $details,
            $messageSequence,
            $this->clock->now(),
        );

        $this->uow->begin();
        try {
            $this->repository->insertReport($report);
            $this->outbox->publish(
                MessagingEvents::AGGREGATE_TYPE,
                $threadId,
                MessagingEvents::THREAD_REPORTED,
                MessagingEvents::threadReported($report),
            );
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $report;
    }

    /**
     * Project a Safety event into the local blocklist. At-least-once by design:
     * source_event_id is the idempotency key, so a replay is a no-op rather than a
     * second block row.
     *
     * Supported event types and payload keys (assumed contract with Safety, stated
     * in README):
     *   ContactBlocked   {event_id, blocker_id, blocked_id, reason, occurred_at}
     *   ContactUnblocked {event_id, blocker_id, blocked_id, occurred_at}
     *
     * @param array<string,mixed> $payload
     */
    public function applySafetyEvent(string $eventType, array $payload): void
    {
        if (!in_array($eventType, ['ContactBlocked', 'ContactUnblocked'], true)) {
            return;
        }
        $eventId = (string) ($payload['event_id'] ?? '');
        $blockerId = (string) ($payload['blocker_id'] ?? '');
        $blockedId = (string) ($payload['blocked_id'] ?? '');
        if ($eventId === '' || $blockerId === '' || $blockedId === '') {
            throw new MessageRefused('A contact event names its event id and both accounts');
        }
        $now = $this->clock->now();

        $this->uow->begin();
        try {
            if ($eventType === 'ContactBlocked') {
                if ($this->repository->findBlockBySourceEvent($eventId) === null) {
                    $this->repository->insertBlock(new ContactBlock(
                        Id::generate('blk')->value(),
                        $blockerId,
                        $blockedId,
                        (string) ($payload['reason'] ?? 'contact blocked'),
                        $eventId,
                        true,
                        $now,
                        null,
                    ));
                }
            } else {
                if ($this->repository->findBlockByReleaseEvent($eventId) === null) {
                    $block = $this->repository->findBlock($blockerId, $blockedId);
                    if ($block !== null) {
                        $this->repository->saveBlock($block->release($now, $eventId));
                    }
                }
            }
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }
    }

    /**
     * An order reached a terminal state. The thread closes for writes and remains
     * readable; the payload must carry thread_id (contract stated in README).
     *
     * @param array<string,mixed> $payload
     */
    public function applyOrderEvent(string $eventType, array $payload): void
    {
        if (!in_array($eventType, ['OrderClosed', 'OrderCancelled'], true)) {
            return;
        }
        $threadId = (string) ($payload['thread_id'] ?? '');
        if ($threadId === '') {
            // Not every order has a thread; the consumer must not invent one.
            return;
        }
        $thread = $this->repository->findThread($threadId);
        if ($thread === null || $thread->status() === ThreadStatus::CLOSED) {
            return;
        }
        $this->close($thread, $eventType === 'OrderCancelled' ? 'ORDER_CANCELLED' : 'ORDER_CLOSED');
    }

    public function closeThread(string $threadId, string $actorId, string $reason): Thread
    {
        $thread = $this->requireThread($threadId);
        $thread->requireParty($actorId);

        return $this->close($thread, $reason);
    }

    /**
     * A staff read of a thread under the capability Identity already grants for
     * deciding a dispute. This is the "plus audit with a capability" path: it is
     * not a participant check and it is not a back door either — the capability is
     * checked server-side, a case id and reason are mandatory, and the access itself
     * is published as an event and written to the audit sink.
     *
     * @return array{thread: Thread, messages: list<Message>}
     */
    public function readThreadForAudit(
        string $threadId,
        string $actorId,
        string $caseId,
        string $reason,
        string $requestId,
    ): array {
        if (trim($caseId) === '' || trim($reason) === '') {
            throw new AuditAccessRefused('An audit read names its case and its reason');
        }
        $this->authorisation->require($actorId, Capability::DISPUTE_DECIDE);
        $account = $this->accounts->find($actorId);
        if ($account === null) {
            throw new AuditAccessRefused('The auditing account no longer exists');
        }
        $thread = $this->requireThread($threadId);
        $now = $this->clock->now();

        $this->uow->begin();
        try {
            $this->outbox->publish(
                MessagingEvents::AGGREGATE_TYPE,
                $threadId,
                MessagingEvents::THREAD_ACCESSED_FOR_AUDIT,
                MessagingEvents::threadAccessedForAudit(
                    $thread,
                    $actorId,
                    Capability::DISPUTE_DECIDE,
                    $caseId,
                    $reason,
                    $now,
                ),
            );
            $this->audit->write(new AuditRecord(
                action: 'thread.read_for_audit',
                targetType: 'thread',
                targetId: $threadId,
                actorId: $actorId,
                actorRole: $account->role,
                sessionId: null,
                capability: Capability::DISPUTE_DECIDE,
                before: null,
                after: [
                    'case_id' => $caseId,
                    'message_count' => $thread->messageCount(),
                    'reason' => $reason,
                ],
                reason: $reason,
                requestId: $requestId,
                subjectId: null,
            ));
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return [
            'thread' => $thread,
            'messages' => $this->repository->allMessages($threadId),
        ];
    }

    /**
     * Unread count for one device. Device-scoped on purpose: two phones belonging
     * to one person have two cursors, and a shared count marks a message read on a
     * phone that never showed it.
     */
    public function unreadCount(string $threadId, string $readerId, string $deviceId): int
    {
        $thread = $this->requireThread($threadId);
        $thread->requireParty($readerId);
        $state = $this->repository->findReadState($threadId, $readerId, $deviceId);
        $read = $state === null ? 0 : (int) $state['last_read_sequence'];

        return max(0, $thread->messageCount() - $read);
    }

    private function close(Thread $thread, string $reason): Thread
    {
        if ($thread->status() === ThreadStatus::CLOSED) {
            return $thread;
        }
        $thread->close($reason, $this->clock->now());

        $this->uow->begin();
        try {
            $this->repository->saveThread($thread, $thread->version() - 1);
            $this->outbox->publish(
                MessagingEvents::AGGREGATE_TYPE,
                $thread->id,
                MessagingEvents::THREAD_CLOSED,
                MessagingEvents::threadClosed($thread),
            );
            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            throw $failure;
        }

        return $thread;
    }

    private function requireThread(string $threadId): Thread
    {
        $thread = $this->repository->findThread($threadId);
        if ($thread === null) {
            throw new ThreadNotFound('Unknown thread: ' . $threadId);
        }

        return $thread;
    }
}
