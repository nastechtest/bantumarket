<?php

declare(strict_types=1);

namespace NasTech\Payouts;

use NasTech\Identity\AccountRepository;
use NasTech\Settlements\Ledger;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Static factories for the composition root. Wiring decides construction order,
 * never a rule.
 *
 * The two ports that come from outside the module are explicit parameters:
 * `AccountRepository` (Identity) and `OrderDisputes` (the module's own port,
 * implemented by an adapter the composition root supplies). Nothing here
 * reaches into Orders or Disputes, which Payouts has no edge to.
 */
final class Wiring
{
    public static function install(Store $store): void
    {
        if ($store instanceof InMemoryStore) {
            Schema::apply($store);
        }
    }

    public static function batches(Store $store): PayoutBatchRepository
    {
        return new PayoutBatchRepository($store);
    }

    public static function preparePayoutBatch(
        UnitOfWork $uow,
        Ledger $ledger,
        Outbox $outbox,
        Clock $clock,
        AccountRepository $accounts,
        OrderDisputes $disputes,
        PayoutBatchRepository $batches,
    ): PreparePayoutBatch {
        return new PreparePayoutBatch($uow, $ledger, $outbox, $clock, $accounts, $disputes, $batches);
    }

    public static function approvePayoutBatch(
        UnitOfWork $uow,
        Ledger $ledger,
        Outbox $outbox,
        Clock $clock,
        PayoutBatchRepository $batches,
    ): ApprovePayoutBatch {
        return new ApprovePayoutBatch($uow, $ledger, $outbox, $clock, $batches);
    }

    public static function failPayoutBatch(
        UnitOfWork $uow,
        Ledger $ledger,
        Outbox $outbox,
        Clock $clock,
        PayoutBatchRepository $batches,
    ): FailPayoutBatch {
        return new FailPayoutBatch($uow, $ledger, $outbox, $clock, $batches);
    }
}
