<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Sign in with a redeemed login code instead of a password.
 *
 * This is the phone-first path: the number was proven by receiving the SMS and
 * the account is identified by the challenge row. It issues exactly the same
 * opaque session a password login does — there is no second session type, and
 * the capabilities are derived from the stored role, never from the proof.
 */
final class LoginWithOtp
{
    public function __construct(
        private readonly AccountRepository $accounts,
        private readonly SessionRegistry $sessions,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(
        OtpRedemption $redemption,
        ?string $deviceLabel = null,
        ?string $remoteIp = null,
    ): IssuedSession {
        if ($redemption->scope !== OtpChallenge::SCOPE_LOGIN) {
            throw new AccessDenied(sprintf(
                'A "%s" code cannot sign in; only a login code can',
                $redemption->scope,
            ));
        }

        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $account = $this->accounts->require($redemption->accountId);
            if (!$account->isActive()) {
                throw AuthFailed::badCredentials();
            }

            $issued = $this->sessions->start($account->id, $deviceLabel, $remoteIp);

            $this->outbox->publish('Session', $issued->session->id, 'SessionIssued', [
                'account_id' => $account->id,
                'session_id' => $issued->session->id,
                'impersonated_by' => null,
                'issued_at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return $issued;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
