<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The server-side capability gate.
 *
 * Authorisation is exactly two things: a role → capability map (Capability)
 * and this class. The HTTP layer and every cross-module command call require()
 * before acting; a UI hiding a button is decoration, not a control. There is
 * no `allow()` anywhere here — the map is allow-by-name, and a capability
 * nobody listed is refused by every role including staff.
 *
 * The impersonation rule is the load-bearing one: an impersonating staff
 * session carries the *target's* capabilities only. If it carried the
 * staff member's, impersonation would be a privilege escalation shaped like
 * an audit feature; nested impersonation is refused for the same reason.
 */
final class Authorisation
{
    public function __construct(private readonly AccountRepository $accounts)
    {
    }

    public function can(string $accountId, string $capability): bool
    {
        $account = $this->accounts->find($accountId);
        if ($account === null || !$account->isActive()) {
            return false;
        }

        return in_array($capability, Capability::forRole($account->role), true);
    }

    /**
     * @throws AccessDenied when the account does not hold the capability
     */
    public function require(string $accountId, string $capability): void
    {
        if (!$this->can($accountId, $capability)) {
            throw new AccessDenied(sprintf(
                'Account %s does not hold the "%s" capability; the command is refused server-side',
                $accountId,
                $capability,
            ));
        }
    }

    /**
     * The same gate seen from a live session, with the impersonation rule:
     * an impersonated session may never re-impersonate, whatever the staff
     * member behind it could otherwise do.
     */
    public function requireFromSession(AuthenticatedSession $session, string $capability): void
    {
        if ($session->isImpersonation() && $capability === Capability::SESSION_IMPERSONATE) {
            throw new AccessDenied(
                'An impersonated session cannot start another impersonation; '
                . 'the audit chain would name two actors and bind neither'
            );
        }
        if (!in_array($capability, $session->capabilities, true)) {
            throw new AccessDenied(sprintf(
                'Session %s does not carry the "%s" capability',
                $session->sessionId,
                $capability,
            ));
        }
    }
}
