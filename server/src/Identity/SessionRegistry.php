<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The session port — the thing the HTTP middleware calls on every request.
 *
 * Kept deliberately small because nearly every module reaches it:
 *   authenticate(token)                 who is asking, with which capabilities
 *   start / issueImpersonated           the two ways a session begins
 *   revoke / revokeAllForAccount        the revocation path a UI can call,
 *                                       and the rotation primitive reset and
 *                                       privilege change rotate on
 *
 * authenticate() answers "no" — one string, one shape — for a token it has
 * never seen, a token it revoked, and a token whose window closed. Distinguishing
 * those is an oracle for probing which session ids were real; the reason
 * belongs in the revoke_reason column and the log, never in the response.
 */
interface SessionRegistry
{
    public function start(string $accountId, ?string $deviceLabel, ?string $remoteIp): IssuedSession;

    public function issueImpersonated(
        string $targetAccountId,
        string $staffAccountId,
        string $purpose,
        ?string $deviceLabel,
        ?string $remoteIp,
        \DateTimeImmutable $hardExpiry,
    ): IssuedSession;

    /**
     * @throws AuthFailed when the token is unknown, revoked or expired
     */
    public function authenticate(string $token): AuthenticatedSession;

    public function revoke(string $sessionId, string $reason): void;

    /**
     * Rotation primitive: revoke every live session an account holds.
     * Returns how many were killed — the command logs it, the subject-facing
     * response does not distinguish "you signed out everywhere" from
     * "someone tried".
     */
    public function revokeAllForAccount(string $accountId, string $reason): int;
}
