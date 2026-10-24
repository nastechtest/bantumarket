<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The result of starting an impersonation: a session that acts as the target,
 * plus the audit row id the END row must name.
 *
 * The log id is returned here and nowhere else. A caller that loses it cannot
 * close the log honestly, which is why it travels with the session token
 * rather than in a payload somebody can forget.
 */
final class ImpersonationGrant
{
    public function __construct(
        public readonly IssuedSession $session,
        public readonly string $startLogId,
    ) {
    }
}
