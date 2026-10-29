<?php

declare(strict_types=1);

namespace NasTech\Tests\Audit;

use NasTech\Audit\AuditLog;
use NasTech\Audit\AuditRepository;
use NasTech\Audit\AuditTrail;
use NasTech\Audit\Wiring;
use NasTech\SharedKernel\AuditSink\AuditRecord;
use NasTech\SharedKernel\FrozenClock;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\InMemoryUnitOfWork;

/**
 * An Audit trail with time under the test's control and a store whose only
 * append-only table is the audit log.
 *
 * The action side is the caller's table (`action_probe` in these tests). The trail
 * cannot know about it, which is the point: it composes with whatever repository
 * the module already has, as long as that repository writes to the same Store.
 */
final class AuditFixture
{
    public const REQUEST = 'req_audit_0001';
    public const OCCURRED_AT = '2026-10-24T10:00:00+00:00';

    public readonly InMemoryStore $store;
    public readonly InMemoryUnitOfWork $uow;
    public readonly FrozenClock $clock;
    public readonly AuditRepository $repository;
    public readonly AuditLog $log;
    public readonly AuditTrail $trail;

    public function __construct(?AuditRepository $repository = null, string $now = self::OCCURRED_AT)
    {
        $this->store = new InMemoryStore();
        Wiring::install($this->store);
        $this->uow = new InMemoryUnitOfWork($this->store);
        $this->clock = FrozenClock::at($now);
        $this->repository = $repository ?? Wiring::auditRepository($this->store);
        $this->log = Wiring::auditLog($this->repository, $this->uow, $this->clock);
        $this->trail = Wiring::auditTrail($this->log, $this->uow);
    }

    /**
     * @param array<string,mixed>|null $before
     * @param array<string,mixed>|null $after
     */
    public function record(
        string $action = 'listing.review',
        string $actorRole = 'staff',
        string $actorId = 'acc_staff_1',
        string $targetType = 'listing',
        string $targetId = 'lst_0001',
        ?string $subjectId = null,
        ?string $capability = 'listing.review',
        ?string $sessionId = 'ses_staff_1',
        ?array $before = ['state' => 'PENDING'],
        ?array $after = ['state' => 'LIVE'],
        ?string $reason = 'reviewed the listing photos',
        string $requestId = self::REQUEST,
    ): AuditRecord {
        return new AuditRecord(
            action: $action,
            targetType: $targetType,
            targetId: $targetId,
            actorId: $actorId,
            actorRole: $actorRole,
            sessionId: $sessionId,
            capability: $capability,
            before: $before,
            after: $after,
            reason: $reason,
            requestId: $requestId,
            subjectId: $subjectId,
        );
    }

    /**
     * One committed row of every actor kind, including an impersonated staff
     * action. AuditDdlTest feeds these rows through every named CHECK.
     */
    public function writeEveryActorKind(): void
    {
        $records = [
            $this->record(
                action: 'order.place',
                actorRole: 'buyer',
                actorId: 'acc_buyer_1',
                targetType: 'order',
                targetId: 'ord_0001',
                capability: null,
                sessionId: 'ses_buyer_1',
            ),
            $this->record(
                action: 'listing.manage',
                actorRole: 'seller',
                actorId: 'acc_seller_1',
                targetType: 'listing',
                targetId: 'lst_0001',
                capability: 'listing.manage',
                sessionId: 'ses_seller_1',
            ),
            $this->record(
                action: 'listing.review',
                actorRole: 'staff',
                actorId: 'acc_staff_1',
                targetType: 'listing',
                targetId: 'lst_0001',
                capability: 'listing.review',
                sessionId: 'ses_staff_1',
            ),
            $this->record(
                action: 'payout.release',
                actorRole: 'system',
                actorId: 'system',
                targetType: 'payout',
                targetId: 'pay_0001',
                capability: null,
                sessionId: null,
                before: ['state' => 'REQUESTED'],
                after: ['state' => 'RELEASED'],
                reason: 'scheduled payout release',
            ),
            $this->record(
                action: 'account.sanction',
                actorRole: 'staff',
                actorId: 'acc_staff_9',
                targetType: 'account',
                targetId: 'acc_buyer_7',
                subjectId: 'acc_buyer_7',
                capability: 'account.sanction',
                sessionId: 'ses_imp_9',
                reason: 'support call about a disputed order',
            ),
        ];

        foreach ($records as $record) {
            $this->trail->record($record, static fn () => null);
        }
    }
}
