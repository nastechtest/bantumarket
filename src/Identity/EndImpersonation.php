<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Close an impersonation: append the END row that names the START row, then
 * revoke the session. Both in one transaction, in that order — a revocation
 * that commits without its audit row is the gap the two-row design exists to
 * make impossible.
 *
 * Ending is allowed after the session expired: the audit trail still needs its
 * closing row, and refusing a late close would leave the trail open precisely
 * in the case somebody forgot.
 */
final class EndImpersonation
{
    public function __construct(
        private readonly ImpersonationLogStore $log,
        private readonly SessionRegistry $sessions,
        private readonly Authorisation $authorisation,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(
        AuthenticatedSession $actor,
        string $sessionId,
        string $startLogId,
        string $note,
    ): ImpersonationLog {
        $this->authorisation->requireFromSession($actor, Capability::SESSION_IMPERSONATE);

        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $start = $this->log->find($startLogId);
            if ($start === null || $start->kind !== ImpersonationLog::KIND_START) {
                throw new \DomainException('The impersonation log to close does not exist, or is not a START row');
            }
            if ($start->actorAccountId !== $actor->accountId) {
                throw new AccessDenied('Only the staff member who started an impersonation may close it');
            }
            if ($start->sessionId !== $sessionId) {
                throw new \DomainException('The log row does not describe this session');
            }

            $end = ImpersonationLog::end(Id::generate('imp')->value(), $start, $note, $now);
            $this->log->append($end);

            $this->sessions->revoke($sessionId, 'impersonation.end');

            $this->outbox->publish('Session', $sessionId, 'ImpersonationEnded', [
                'session_id' => $sessionId,
                'actor_account_id' => $actor->accountId,
                'target_account_id' => $start->targetAccountId,
                'start_log_id' => $start->id,
                'end_log_id' => $end->id,
                'at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return $end;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
