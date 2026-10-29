<?php

declare(strict_types=1);

namespace NasTech\Notifications;

/**
 * A refusal from the notifications write path. One type for validation and
 * policy because the caller treats every refusal the same way: 4xx, no retry,
 * and the reason is safe to show the account that attempted the write.
 */
class NotificationRefused extends \DomainException
{
}
