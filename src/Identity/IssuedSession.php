<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The only moment a session token exists in plaintext: the row as stored and
 * the bearer string as handed out. Returned once by every issuing command —
 * like the handover PIN — and never readable again afterwards. The HTTP layer
 * puts it in a cookie and forgets it.
 */
final class IssuedSession
{
    public function __construct(
        public readonly Session $session,
        public readonly string $token,
    ) {
    }
}
