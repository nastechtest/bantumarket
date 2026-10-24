<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * What an authenticated request is allowed to know about itself: who the
 * principal is, which capabilities the server derived, and whether someone is
 * acting through an impersonation. No other module reads sessions — the HTTP
 * layer authenticates here and passes the accountId into commands, exactly as
 * ConfirmHandover takes an actorId it never takes from the body.
 */
final class AuthenticatedSession
{
    /**
     * @param list<string> $capabilities
     */
    public function __construct(
        public readonly string $sessionId,
        public readonly string $accountId,
        public readonly string $role,
        public readonly array $capabilities,
        public readonly ?string $impersonatedBy,
        public readonly \DateTimeImmutable $expiresAt,
    ) {
    }

    public function isImpersonation(): bool
    {
        return $this->impersonatedBy !== null;
    }
}
