<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * End the current session. The revoke reason is recorded on the row and the
 * subject-facing answer is the same whether the session was already dead —
 * there is nothing an attacker learns from signing out twice.
 */
final class SignOut
{
    public function __construct(
        private readonly SessionRegistry $sessions,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(AuthenticatedSession $session): void
    {
        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $this->sessions->revoke($session->sessionId, 'sign.out');

            $this->outbox->publish('Session', $session->sessionId, 'SessionRevoked', [
                'session_id' => $session->sessionId,
                'account_id' => $session->accountId,
                'reason' => 'sign.out',
                'at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
