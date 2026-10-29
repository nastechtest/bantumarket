<?php

declare(strict_types=1);

namespace NasTech\Notifications;

/**
 * A read or a delivery attempt named a notification that does not exist.
 * Separate from the general refusal so a caller can answer 404 without parsing
 * the message, and so "read before create" has a name in the test suite.
 */
final class NotificationNotFound extends NotificationRefused
{
}
