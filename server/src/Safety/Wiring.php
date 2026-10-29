<?php

declare(strict_types=1);

namespace NasTech\Safety;

use NasTech\Identity\AccountRepository;
use NasTech\Identity\Authorisation;
use NasTech\Identity\SessionRegistry;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Static factories for the composition root. Wiring decides construction
 * order, never a rule; Application/Kernel.php is controller-owned.
 *
 * The Identity ports are parameters because Safety names the account and
 * session interfaces, not Identity's tables: a sanction checks that the target
 * account exists, and a ban revokes sessions through SessionRegistry. That is
 * the whole Safety -> Identity edge.
 */
final class Wiring
{
    public static function install(Store $store): void
    {
        if ($store instanceof InMemoryStore) {
            Schema::apply($store);
        }
    }

    public static function repository(Store $store): SafetyRepository
    {
        return new InMemorySafetyRepository($store);
    }

    public static function service(
        SafetyRepository $repository,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
        AccountRepository $accounts,
        SessionRegistry $sessions,
        ?Authorisation $authorisation = null,
    ): SafetyService {
        return new SafetyService(
            $repository,
            $uow,
            $outbox,
            $clock,
            $accounts,
            $sessions,
            $authorisation ?? new Authorisation($accounts),
        );
    }

    private function __construct()
    {
    }
}
