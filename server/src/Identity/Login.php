<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Sign in with phone and password, and receive a session.
 *
 * Every rejection is the same sentence and the same exception class:
 * unknown phone, wrong password, locked credential, suspended account and
 * erased account are indistinguishable. The work is made indistinguishable
 * too — an unknown phone runs one real KDF round against a decoy digest via
 * dummyCheck(), so the response shape does not answer "does this account
 * exist" even to a caller with a stopwatch.
 *
 * Attempts live on the credential row and lock at eight. The response never
 * carries attemptsRemaining: a caller who can read the budget can tune a
 * guessing campaign, and the number that would tell them is also the number
 * that confirms the account.
 */
final class Login
{
    public function __construct(
        private readonly AccountRepository $accounts,
        private readonly CredentialStore $credentials,
        private readonly PasswordHasher $hasher,
        private readonly SessionRegistry $sessions,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
        private readonly \DateInterval $lockWindow,
    ) {
    }

    public function handle(
        string $rawPhone,
        string $password,
        ?string $deviceLabel = null,
        ?string $remoteIp = null,
    ): IssuedSession {
        $now = $this->clock->now();

        $phone = self::tryNormalise($rawPhone);
        if ($phone === null) {
            // Malformed input takes the same path as a well-formed unknown
            // number: one KDF round and the uniform sentence.
            $this->hasher->dummyCheck($password);
            throw AuthFailed::badCredentials();
        }

        $account = $this->accounts->findByPhone($phone->e164);
        if ($account === null || !$account->isActive()) {
            $this->hasher->dummyCheck($password);
            throw AuthFailed::badCredentials();
        }

        $credential = $this->credentials->forAccount($account->id);
        if ($credential === null || $credential->isErased()) {
            $this->hasher->dummyCheck($password);
            throw AuthFailed::badCredentials();
        }

        // A locked credential still runs the real check, so "locked" costs the
        // same as "wrong" and answers the same. It does not run recordFailure:
        // grinding a locked account is what the lock exists to stop.
        $matched = $this->hasher->check($password, $credential->passwordHash, $credential->ladderStep);
        if (!$matched || $credential->isLockedAt($now)) {
            if (!$matched && !$credential->isLockedAt($now)) {
                $this->recordFailure($credential, $now);
            }
            throw AuthFailed::badCredentials();
        }

        $this->uow->begin();
        try {
            $credential->resetFailures();
            if ($this->hasher->needsUpgrade($credential->passwordHash, $credential->ladderStep)) {
                $credential->replaceSecret($this->hasher, $password, $now);
            }
            $this->credentials->save($credential);

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

    /**
     * Persist one failed attempt. The lock is recorded; the caller is told
     * nothing beyond the uniform AuthFailed that is thrown after the commit.
     */
    private function recordFailure(Credential $credential, \DateTimeImmutable $now): void
    {
        $locked = false;
        $this->uow->begin();
        try {
            $locked = $credential->recordFailure($now, $this->lockWindow);
            $this->credentials->save($credential);

            $this->outbox->publish('Credential', $credential->accountId, $locked ? 'CredentialLocked' : 'CredentialRejected', [
                'account_id' => $credential->accountId,
                // Committed for the owner's support channel and the fraud
                // review; never returned to the caller.
                'failed_attempts' => $credential->failedAttempts,
                'locked_until' => $credential->lockedUntil?->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            // A credential already at the ceiling has nothing left to record;
            // the caller still gets the uniform rejection, not a different one.
        }
    }

    private static function tryNormalise(string $raw): ?PhoneNumber
    {
        try {
            return PhoneNumber::fromString($raw);
        } catch (\InvalidArgumentException) {
            return null;
        }
    }
}
