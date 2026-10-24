<?php

declare(strict_types=1);

namespace NasTech\Handover;

/**
 * Raised when a handover cannot proceed. Always carries the reason the seller
 * sees, because "the PIN did not work" and "the window closed" are different
 * support conversations.
 */
final class HandoverRejected extends \DomainException
{
}
