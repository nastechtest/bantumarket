<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * The account is not a party to this thread. A 404-shaped refusal rather than a
 * 403: telling a stranger that a thread exists is itself a disclosure about two
 * other people, so the HTTP layer maps this to "not found" on purpose.
 */
final class NotAParticipant extends \DomainException
{
}
