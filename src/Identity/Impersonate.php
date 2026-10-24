<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Start a bounded, separately-audited impersonation session.
 *
 * The bound is min(now + 30 minutes, the staff session's own expiry): a
 * support session must not outlive the session that authorised it, and it must
 * not be extendable by holding the tab open. The audit START row is written in
 * the same transaction as the session, so a session that exists without a log
 * row cannot commit.
 *
 * The impersonated session carries the *target's* capabilities, never the
 * staff member's — see Authorisation::requireFromSession. Nested
 * impersonation is refused there, for the same reason.
 */
final class Impersonate
{
    public const MAX_WINDOW = 'PT30M';

    public function __construct(
        private readonly AccountRepository $accounts,
        private readonly Authorisation $authorisation,
        private readonly SessionRegistry $sessions,
        private readonly ImpersonationLogStore $log,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(
        AuthenticatedSession $actor,
        string $targetAccountId,
        string $purpose,
        ?string $deviceLabel = null,
        ?string $remoteIp = null,
    ): ImpersonationGrant {
        $this->authorisation->requireFromSession($actor, Capability::SESSION_IMPERSONATE);

        $now = $this->clock->now();
        if ($now >= $actor->expiresAt) {
            throw new AccessDenied('The staff session has expired; it cannot authorise an impersonation');
        }

        $target = $this->accounts->require($targetAccountId);
        if (!$target->isActive()) {
            throw new \DomainException('An inactive account cannot be impersonated; there is nobody to act as');
        }

        $hardExpiry = self::earlier($now->add(new \DateInterval(self::MAX_WINDOW)), $actor->expiresAt);

        $this->uow->begin();
        try {
            $issued = $this->sessions->issueImpersonated(
                targetAccountId: $target->id,
                staffAccountId: $actor->accountId,
                purpose: $purpose,
                deviceLabel: $deviceLabel,
                remoteIp: $remoteIp,
                hardExpiry: $hardExpiry,
            );

            $start = ImpersonationLog::start(
                id: Id::generate('imp')->value(),
                actorAccountId: $actor->accountId,
                targetAccountId: $target->id,
                sessionId: $issued->session->id,
                purpose: $purpose,
                now: $now,
            );
            $this->log->append($start);

            $this->outbox->publish('Session', $issued->session->id, 'ImpersonationStarted', [
                'session_id' => $issued->session->id,
                'actor_account_id' => $actor->accountId,
                'target_account_id' => $target->id,
                'start_log_id' => $start->id,
                'expires_at' => $issued->session->expiresAt->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return new ImpersonationGrant($issued, $start->id);
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    private static function earlier(\DateTimeImmutable $left, \DateTimeImmutable $right): \DateTimeImmutable
    {
        return $left < $right ? $left : $right;
    }
}
