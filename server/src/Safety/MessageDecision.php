<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * The answer to "may these two accounts exchange a message?".
 *
 * One method, one object, one reason. Messaging asks this instead of reading
 * Safety's tables, which keeps the block rule in the module that owns it and
 * makes the symmetric effect a property of the decision rather than of a
 * check the sender's own code happens to remember.
 */
final class MessageDecision
{
    public const ALLOWED = 'ALLOWED';
    public const SAME_ACCOUNT = 'SAME_ACCOUNT';
    public const SENDER_BLOCKED_RECIPIENT = 'SENDER_BLOCKED_RECIPIENT';
    public const RECIPIENT_BLOCKED_SENDER = 'RECIPIENT_BLOCKED_SENDER';

    public function __construct(
        public readonly bool $allowed,
        public readonly string $reason,
        public readonly ?string $blockId = null,
        public readonly ?string $blockReason = null,
    ) {
    }

    public static function allow(): self
    {
        return new self(true, self::ALLOWED);
    }

    public static function deny(string $reason, ?string $blockId = null, ?string $blockReason = null): self
    {
        return new self(false, $reason, $blockId, $blockReason);
    }
}
