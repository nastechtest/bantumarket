<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Persistence\Store;

/**
 * The Store-backed session registry — what tests and this environment run;
 * against a real cluster the Store adapter is the SQL side and this class is
 * unchanged, because every lookup here is one index away from the DDL:
 * sessions_token_used_once, sessions_by_account.
 */
final class StoreSessionRegistry implements SessionRegistry
{
    public const TABLE = 'sessions';

    public function __construct(
        private readonly Store $store,
        private readonly Clock $clock,
        private readonly AccountRepository $accounts,
        private readonly \DateInterval $sessionWindow,
        private readonly string $ipPepper,
    ) {
    }

    public function start(string $accountId, ?string $deviceLabel, ?string $remoteIp): IssuedSession
    {
        $account = $this->accounts->require($accountId);
        if (!$account->isActive()) {
            // Internal path: callers only get here after a successful proof,
            // and an account that went inactive mid-flow must not acquire a
            // session. This is not an attacker-facing branch.
            throw new \DomainException('Only an active account can hold a session');
        }

        $token = Session::token();
        $now = $this->clock->now();
        $session = Session::begin(
            id: Id::generate('ses')->value(),
            accountId: $account->id,
            deviceLabel: $deviceLabel,
            remoteIp: $remoteIp,
            ipPepper: $this->ipPepper,
            now: $now,
            window: $this->sessionWindow,
            token: $token,
        );

        $this->persist($session);

        return new IssuedSession($session, $token);
    }

    public function issueImpersonated(
        string $targetAccountId,
        string $staffAccountId,
        string $purpose,
        ?string $deviceLabel,
        ?string $remoteIp,
        \DateTimeImmutable $hardExpiry,
    ): IssuedSession {
        $account = $this->accounts->require($targetAccountId);
        if (!$account->isActive()) {
            throw new \DomainException('An inactive account cannot be impersonated; there is nobody to act as');
        }

        $token = Session::token();
        $session = Session::beginImpersonated(
            id: Id::generate('ses')->value(),
            targetAccountId: $account->id,
            staffAccountId: $staffAccountId,
            purpose: $purpose,
            deviceLabel: $deviceLabel,
            remoteIp: $remoteIp,
            ipPepper: $this->ipPepper,
            now: $this->clock->now(),
            hardExpiry: $hardExpiry,
            token: $token,
        );

        $this->persist($session);

        return new IssuedSession($session, $token);
    }

    public function authenticate(string $token): AuthenticatedSession
    {
        $tokenHash = Session::hashToken($token);
        $record = null;
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['token_hash'] === $tokenHash) {
                $record = $row;
                break;
            }
        }

        if ($record === null) {
            // Unknown token: same answer as a revoked one. A registry that
            // distinguished them would be a scanner for live session ids.
            throw AuthFailed::invalidSession();
        }

        $session = Session::fromRow($record);
        $now = $this->clock->now();
        $account = $this->accounts->find($session->accountId);

        if (!$session->isUsableAt($now) || $account === null || !$account->isActive()) {
            throw AuthFailed::invalidSession();
        }

        if ($session->touch($now)) {
            $this->store->update(self::TABLE, $session->toArray());
        }

        return new AuthenticatedSession(
            sessionId: $session->id,
            accountId: $account->id,
            role: $account->role,
            capabilities: Capability::forRole($account->role),
            impersonatedBy: $session->impersonatedBy,
            expiresAt: $session->expiresAt,
        );
    }

    public function revoke(string $sessionId, string $reason): void
    {
        $record = $this->store->find(self::TABLE, $sessionId);
        if ($record === null) {
            return;
        }
        $session = Session::fromRow($record);
        if ($session->revokedAt !== null) {
            return;
        }
        $session->revoke($reason, $this->clock->now());
        $this->store->update(self::TABLE, $session->toArray());
    }

    public function revokeAllForAccount(string $accountId, string $reason): int
    {
        $now = $this->clock->now();
        $killed = 0;
        foreach ($this->store->all(self::TABLE) as $record) {
            if ((string) $record['account_id'] !== $accountId) {
                continue;
            }
            $session = Session::fromRow($record);
            if ($session->isUsableAt($now)) {
                $session->revoke($reason, $now);
                $this->store->update(self::TABLE, $session->toArray());
                $killed++;
            }
        }

        return $killed;
    }

    /**
     * Anonymise every session row of an erased subject: the live ones die and
     * the device naming goes NULL on all of them, including the historical
     * rows — what stays is the token digest and the revocation trail, which
     * are evidence, not personal data.
     */
    public function anonymiseForAccount(string $accountId, \DateTimeImmutable $now): void
    {
        foreach ($this->store->all(self::TABLE) as $record) {
            if ((string) $record['account_id'] !== $accountId) {
                continue;
            }
            $session = Session::fromRow($record);
            $session->anonymise($now);
            $this->store->update(self::TABLE, $session->toArray());
        }
    }

    private function persist(Session $session): void
    {
        $this->store->insert(self::TABLE, $session->toArray());
    }
}
