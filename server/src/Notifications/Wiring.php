<?php

declare(strict_types=1);

namespace NasTech\Notifications;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Static factories only. Wiring decides construction order and nothing else;
 * Application/Kernel.php is controller-owned and binds these.
 *
 * The dependency list is short on purpose. Notifications reacts to outbox
 * events and imports no business module: a message, an order, a dispute and a
 * payout all arrive as (event id, recipient, kind, subject id), never as a
 * class from the module that owns them.
 */
final class Wiring
{
    public static function install(InMemoryStore $store): void
    {
        Schema::apply($store);
    }

    public static function repository(Store $store): NotificationRepository
    {
        return new InMemoryNotificationRepository($store);
    }

    public static function service(
        NotificationRepository $repository,
        UnitOfWork $uow,
        Clock $clock,
    ): NotificationService {
        return new NotificationService($repository, $uow, $clock);
    }

    private function __construct()
    {
    }
}
