<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The capability check failed, server-side. Maps to HTTP 403 at the edge —
 * unlike AuthFailed (401), the caller is known; they are simply not allowed.
 * The message is operator-facing and may name the missing capability, because
 * an authenticated principal probing their own rights gains nothing: the
 * allow-by-name map in Capability is the thing that decides, and it is audited.
 */
final class AccessDenied extends \DomainException
{
}
