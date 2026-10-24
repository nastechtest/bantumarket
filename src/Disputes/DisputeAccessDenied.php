<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * The actor is not one of the two parties on the order, or does not hold the capability
 * the action needs.
 *
 * Separate from `DisputeRuleViolation` because the HTTP edge maps them differently —
 * 403 versus 422 — and because the party-facing message must never leak which capability
 * a colleague lacks. A case file is read by exactly two accounts and a named staff
 * member; nobody else learns anything about it, not even that it exists.
 */
final class DisputeAccessDenied extends \DomainException
{
}
