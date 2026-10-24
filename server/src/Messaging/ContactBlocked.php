<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * A send was refused because one party has blocked the other.
 *
 * The reason is stated to the sender on purpose: a silent drop teaches a blocked
 * person to try again from another account, and it leaves the blocker's safety
 * decision invisible to the person it protects against. It never says who blocked
 * whom, only that contact is closed.
 */
final class ContactBlocked extends \DomainException
{
    public function __construct(public readonly string $threadId)
    {
        parent::__construct('This conversation is closed to new messages: one of the accounts has blocked contact');
    }
}
