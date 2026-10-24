<?php

declare(strict_types=1);

namespace NasTech\Messaging;

use NasTech\Identity\AccountRepository;
use NasTech\Identity\Authorisation;
use NasTech\SharedKernel\AuditSink\AuditSink;
use NasTech\SharedKernel\AuditSink\NullAuditSink;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Static factories only. Application/Kernel.php is controller-owned; this file is
 * the seam it binds, and it decides no rule.
 */
final class Wiring
{
    public static function applySchema(InMemoryStore $store): void
    {
        Schema::apply($store);
    }

    public static function repository(Store $store): MessagingRepository
    {
        return new InMemoryMessagingRepository($store);
    }

    public static function sqlRepository(SqlExecutor $executor): MessagingRepository
    {
        return new SqlMessagingRepository($executor);
    }

    public static function service(
        MessagingRepository $repository,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
        AccountRepository $accounts,
        Authorisation $authorisation,
        ?ContactSafetyScanner $scanner = null,
        ?AuditSink $audit = null,
    ): MessagingService {
        return new MessagingService(
            $repository,
            $uow,
            $outbox,
            $clock,
            $accounts,
            $authorisation,
            $scanner ?? new ContactSafetyScanner(),
            $audit ?? new NullAuditSink(),
        );
    }

    private function __construct()
    {
    }
}
