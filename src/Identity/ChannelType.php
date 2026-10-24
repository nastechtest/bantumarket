<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The contact-channel vocabulary, as the DDL declares it.
 *
 * A channel is an address a message can be sent to, not a claim about the
 * person. `phone` is the identity anchor and therefore E.164; `email` is
 * lowercased so one mailbox is one channel; `push` is an opaque device token.
 */
enum ChannelType: string
{
    case PHONE = 'phone';
    case EMAIL = 'email';
    case PUSH = 'push';

    /**
     * @return list<string>
     */
    public static function wireValues(): array
    {
        return array_map(static fn (self $type): string => $type->value, self::cases());
    }
}
