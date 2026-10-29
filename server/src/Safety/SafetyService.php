<?php

declare(strict_types=1);

namespace NasTech\Safety;

use NasTech\Identity\AccountRepository;
use NasTech\Identity\Authorisation;
use NasTech\Identity\Capability;
use NasTech\Identity\SessionRegistry;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * The Safety use cases.
 *
 * The service owns three decisions and nothing else:
 *
 *   - a report body is screened before it is stored, and readReport() is the
 *     only path that can return it — to the reporter or to staff, never to the
 *     account the report is about;
 *   - a block is idempotent and mayMessage() answers both directions in one
 *     call, so Messaging cannot accidentally ask only "did the sender block?"
 *   - a warning is issued by one actor, a suspend or ban is proposed by one and
 *     applied by another, and the ban revokes sessions through Identity's port.
 *
 * Safety's outbox carries ids and classifications. No event published here
 * carries a report body.
 */
final class SafetyService
{
    public function __construct(
        private readonly SafetyRepository $repository,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
        private readonly AccountRepository $accounts,
        private readonly SessionRegistry $sessions,
        private readonly Authorisation $authorisation,
    ) {
    }

    public function fileReport(
        string $reporterId,
        string $subjectType,
        string $subjectId,
        string $reportedAccountId,
        string $reason,
        string $body,
    ): Report {
        $this->requireAccount($reporterId, 'The reporter');
        $this->requireAccount($reportedAccountId, 'The account a report is about');

        $now = $this->clock->now();
        $report = Report::file(
            Id::generate('rpt')->value(),
            $reporterId,
            $subjectType,
            $subjectId,
            $reportedAccountId,
            $reason,
            $body,
            $now,
        );

        $this->uow->begin();
        try {
            $this->repository->saveReport($report);

            // The payload carries the classification and the ids only. A body
            // on the outbox would be read by every consumer and retained by
            // the dispatcher, which is exactly the second copy the rule forbids.
            $this->outbox->publish('SafetyReport', $report->id, SafetyEvents::REPORT_FILED, [
                'report_id' => $report->id,
                'reporter_id' => $report->reporterId,
                'subject_type' => $report->subjectType,
                'subject_id' => $report->subjectId,
                'reported_account_id' => $report->reportedAccountId,
                'reason' => $report->reason,
                'state' => $report->state,
                'filed_at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return $report;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    /**
     * The one retrieval path for a report.
     *
     * Staff is a capability, not a role string, and the reported party is
     * checked first: an account that is both staff and the subject still does
     * not get the body, because the rule is "never echoed back to the reported
     * party", not "staff can read everything".
     */
    public function readReport(string $reportId, string $viewerId): ReportView
    {
        $report = $this->repository->findReport($reportId) ?? throw ReportNotFound::withId($reportId);

        $visibility = ReportView::WITHHELD_FROM_OTHER;
        $withheld = 'Only the reporter and staff may read the report body.';
        $body = null;

        if ($viewerId === $report->reportedAccountId) {
            $visibility = ReportView::WITHHELD_FROM_REPORTED_PARTY;
            $withheld = 'The report body is never shown to the account the report is about.';
        } elseif ($viewerId === $report->reporterId) {
            $visibility = ReportView::VISIBLE_TO_REPORTER;
            $withheld = null;
            $body = $report->body;
        } elseif ($this->authorisation->can($viewerId, Capability::ACCOUNT_SANCTION)) {
            $visibility = ReportView::VISIBLE_TO_STAFF;
            $withheld = null;
            $body = $report->body;
        }

        return new ReportView(
            reportId: $report->id,
            reporterId: $report->reporterId,
            subjectType: $report->subjectType,
            subjectId: $report->subjectId,
            reportedAccountId: $report->reportedAccountId,
            reason: $report->reason,
            state: $report->state,
            body: $body,
            bodyVisibility: $visibility,
            withheldReason: $withheld,
        );
    }

    /**
     * Idempotent by pair: a retried block returns the row already written and
     * publishes no second event.
     */
    public function block(string $blockerId, string $blockedId, string $reason): Block
    {
        $this->requireAccount($blockerId, 'The blocking account');
        $this->requireAccount($blockedId, 'The blocked account');

        $existing = $this->repository->findBlock($blockerId, $blockedId);
        if ($existing !== null) {
            return $existing;
        }

        $now = $this->clock->now();
        $block = Block::record(Id::generate('blk')->value(), $blockerId, $blockedId, $reason, $now);

        $this->uow->begin();
        try {
            $this->repository->saveBlock($block);

            $this->outbox->publish('SafetyBlock', $block->id, SafetyEvents::CONTACT_BLOCKED, [
                'event_id' => $block->id,
                'blocker_id' => $block->blockerId,
                'blocked_id' => $block->blockedId,
                'reason' => $block->reason,
                'blocked_at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return $block;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    /**
     * The single messaging decision. A block in either direction denies the
     * pair, and the reason says which side refused.
     */
    public function mayMessage(string $senderId, string $recipientId): MessageDecision
    {
        if ($senderId === $recipientId) {
            return MessageDecision::deny(MessageDecision::SAME_ACCOUNT);
        }

        $block = $this->repository->findBlockBetweenEitherWay($senderId, $recipientId);
        if ($block === null) {
            return MessageDecision::allow();
        }

        return $block->blockerId === $senderId
            ? MessageDecision::deny(MessageDecision::SENDER_BLOCKED_RECIPIENT, $block->id, $block->reason)
            : MessageDecision::deny(MessageDecision::RECIPIENT_BLOCKED_SENDER, $block->id, $block->reason);
    }

    /**
     * Raise a sanction. A warning is applied here; a suspend or ban becomes a
     * proposal and waits for a different staff account.
     */
    public function requestSanction(
        string $actorId,
        string $targetAccountId,
        string $action,
        string $reason,
        \DateTimeImmutable $expiresAt,
    ): Sanction {
        $this->authorisation->require($actorId, Capability::ACCOUNT_SANCTION);

        if ($this->accounts->find($targetAccountId) === null) {
            throw new SafetyRuleViolation(sprintf(
                'A sanction cannot be applied to account %s; it does not exist',
                $targetAccountId,
            ));
        }
        if ($actorId === $targetAccountId) {
            throw new SafetyRuleViolation('An account cannot sanction itself');
        }

        $now = $this->clock->now();
        $sanction = Sanction::request(
            Id::generate('snc')->value(),
            $targetAccountId,
            $action,
            $reason,
            $actorId,
            $expiresAt,
            $now,
        );

        $singleActor = $sanction->state === SanctionState::APPLIED;
        $decision = $singleActor
            ? SanctionDecision::warningIssued(
                Id::generate('sdc')->value(),
                $sanction->id,
                $actorId,
                $sanction->reason,
                $now,
            )
            : SanctionDecision::proposed(
                Id::generate('sdc')->value(),
                $sanction->id,
                $actorId,
                $sanction->reason,
                $now,
            );

        $this->uow->begin();
        try {
            $this->repository->saveSanction($sanction);
            $this->repository->appendDecision($decision);
            $this->publishSanction($sanction, 0, $now);
            $this->uow->commit();

            return $sanction;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    /**
     * The checker's decision. A ban revokes every live session through
     * Identity's SessionRegistry before the sanction row is committed, so the
     * account cannot keep acting on a session opened before the ban.
     */
    public function approveSanction(string $checkerId, string $sanctionId): Sanction
    {
        $this->authorisation->require($checkerId, Capability::ACCOUNT_SANCTION);

        $sanction = $this->repository->findSanction($sanctionId) ?? throw SanctionNotFound::withId($sanctionId);
        $now = $this->clock->now();
        $applied = $sanction->approve($checkerId, $now);

        $this->uow->begin();
        try {
            $sessionsRevoked = 0;
            if ($applied->isBan()) {
                $sessionsRevoked = $this->sessions->revokeAllForAccount($applied->targetAccountId, 'safety.ban');
            }

            $this->repository->saveSanction($applied);
            $this->repository->appendDecision(SanctionDecision::approved(
                Id::generate('sdc')->value(),
                $applied->id,
                $checkerId,
                $applied->reason,
                $now,
            ));
            $this->publishSanction($applied, $sessionsRevoked, $now);
            $this->uow->commit();

            return $applied;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    /**
     * @return list<SanctionDecision>
     */
    public function evidenceFor(string $sanctionId): array
    {
        return $this->repository->decisionsFor($sanctionId);
    }

    private function publishSanction(Sanction $sanction, int $sessionsRevoked, \DateTimeImmutable $at): void
    {
        $payload = [
            'sanction_id' => $sanction->id,
            'account_id' => $sanction->targetAccountId,
            'action' => $sanction->action,
            'reason' => $sanction->reason,
            'expires_at' => $sanction->expiresAt->format(\DateTimeInterface::ATOM),
            'maker_id' => $sanction->makerId,
            'checker_id' => $sanction->checkerId,
            'at' => $at->format(\DateTimeInterface::ATOM),
        ];

        if ($sanction->state === SanctionState::APPLIED) {
            $this->outbox->publish('Sanction', $sanction->id, SafetyEvents::SANCTION_APPLIED, $payload + [
                'sessions_revoked' => $sessionsRevoked,
            ]);

            return;
        }

        $this->outbox->publish('Sanction', $sanction->id, SafetyEvents::SANCTION_PROPOSED, $payload);
    }

    private function requireAccount(string $accountId, string $role): void
    {
        if ($this->accounts->find($accountId) === null) {
            throw new SafetyRuleViolation(sprintf('%s %s does not exist', $role, $accountId));
        }
    }
}
