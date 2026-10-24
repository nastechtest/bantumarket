<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * A refusal from the messaging write path. One exception type for validation and
 * policy because every caller treats it the same way: 4xx, no retry, and the reason
 * is safe to show the account that attempted the write.
 */
final class MessageRefused extends \DomainException
{
}
