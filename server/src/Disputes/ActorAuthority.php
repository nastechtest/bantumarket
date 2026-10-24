<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * The server-side capability gate for staff actions on a case.
 *
 * Party membership is checked separately and first: a buyer does not need a
 * capability to read their own case. What this port answers is the other half —
 * "does this staff account hold the permission to decide / escalate / close" —
 * and it is deliberately an interface, because the grant store is Identity's
 * and this module may not read Identity's schema.
 *
 * Implementations must fail closed: an unknown account, an unknown capability,
 * an empty grant list or a missing grant answer false. The UI hiding a button is
 * not a control; this is.
 */
interface ActorAuthority
{
    public function has(string $accountId, string $capability): bool;

    /**
     * @throws DisputeAccessDenied when the account does not hold the capability
     */
    public function require(string $accountId, string $capability): void;
}
