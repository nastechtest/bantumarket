<?php

declare(strict_types=1);

namespace NasTech\Media;

use NasTech\SharedKernel\StateMachine;

/**
 * The media state ladder, in one deny-by-default table.
 *
 * What is absent is the load-bearing part:
 *
 * - No event reaches PUBLISHED from STAGED. A record must be verified first, and
 *   verification is the digest check, so an unverified upload has no path to a
 *   buyer's screen — not a path that somebody must remember to guard.
 * - Nothing leaves REJECTED or RETIRED. A rejected record's bytes stay in the
 *   bucket for as long as its retention class says, but the record never becomes
 *   publishable: the fix is a new record with a new digest, because a dispute may
 *   need to know which of the two a buyer saw.
 * - There is no EDIT event at all. Media content is never overwritten in place.
 */
final class MediaTransitions
{
    public const EV_VERIFY = 'VERIFY';
    public const EV_REJECT = 'REJECT';
    public const EV_PUBLISH = 'PUBLISH';
    public const EV_RETIRE = 'RETIRE';

    /** @var array<string, array<string, string>> */
    public const TABLE = [
        MediaState::STAGED->value => [
            self::EV_VERIFY => MediaState::VERIFIED->value,
            self::EV_REJECT => MediaState::REJECTED->value,
        ],
        MediaState::VERIFIED->value => [
            self::EV_PUBLISH => MediaState::PUBLISHED->value,
            self::EV_RETIRE => MediaState::RETIRED->value,
            self::EV_REJECT => MediaState::REJECTED->value,
        ],
        MediaState::PUBLISHED->value => [
            self::EV_RETIRE => MediaState::RETIRED->value,
        ],
        MediaState::RETIRED->value => [],
        MediaState::REJECTED->value => [],
    ];

    public static function machine(): StateMachine
    {
        return new StateMachine('MediaRecord', self::TABLE);
    }

    private function __construct()
    {
    }
}
