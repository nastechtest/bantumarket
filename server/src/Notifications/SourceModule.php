<?php

declare(strict_types=1);

namespace NasTech\Notifications;

/**
 * The modules allowed to cause a notification. The list is closed because the
 * alternative — a free-text `source` column — turns every producer typo into a
 * notification kind nobody can route or report on.
 *
 * These are names, not imports: Notifications has no outbound edge to any of
 * these modules. It sees their events through the outbox, and an event id plus
 * a subject id is the whole of what it retains.
 */
enum SourceModule: string
{
    case MESSAGING = 'Messaging';
    case ORDERS = 'Orders';
    case DISPUTES = 'Disputes';
    case SETTLEMENTS = 'Settlements';
    case LISTINGS = 'Listings';
    case CAPTURE = 'Capture';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $module): string => $module->value, self::cases());
    }
}
