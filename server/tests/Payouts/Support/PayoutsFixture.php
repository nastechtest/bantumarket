<?php

declare(strict_types=1);

namespace NasTech\Tests\Payouts\Support;

use NasTech\Identity\Account;
use NasTech\Identity\InMemoryAccountRepository;
use NasTech\Identity\PhoneNumber;
use NasTech\Payouts\ApprovePayoutBatch;
use NasTech\Payouts\FailPayoutBatch;
use NasTech\Payouts\PayoutBatch;
use NasTech\Payouts\PayoutBatchRepository;
use NasTech\Payouts\PayoutLineRequest;
use NasTech\Payouts\PreparePayoutBatch;
use NasTech\Payouts\Wiring;
use NasTech\SharedKernel\Money;
use NasTech\Tests\Support\MoneyFixture;

/**
 * A completed sale, one active seller account, and the Payouts commands wired
 * against the money path's store, unit of work, ledger and outbox.
 *
 * Everything a test varies is passed to it; everything a test asserts against
 * lives here. The seller account id is the ledger's seller id on purpose — a
 * payout to an id that has no account is refused, and the fixture should model
 * the normal case rather than a lucky one.
 */
final class PayoutsFixture
{
    public readonly MoneyFixture $money;
    public readonly PayoutBatchRepository $batches;
    public readonly PreparePayoutBatch $prepare;
    public readonly ApprovePayoutBatch $approve;
    public readonly FailPayoutBatch $fail;
    public readonly InMemoryAccountRepository $accounts;
    public readonly FakeOrderDisputes $disputes;

    public function __construct()
    {
        $this->money = new MoneyFixture();
        $this->money->completeSale();

        $kernel = $this->money->kernel;
        Wiring::install($kernel->store);

        $this->accounts = new InMemoryAccountRepository($kernel->store);
        $seller = Account::register(
            MoneyFixture::SELLER,
            PhoneNumber::fromString('+27821234567'),
            'Thandi Mokoena',
            $kernel->clock->now(),
        );
        $seller->assignRole(Account::ROLE_SELLER);
        $this->accounts->save($seller);

        $this->disputes = new FakeOrderDisputes();
        $this->batches = Wiring::batches($kernel->store);
        $this->prepare = Wiring::preparePayoutBatch(
            $kernel->uow,
            $kernel->ledger,
            $kernel->outbox,
            $kernel->clock,
            $this->accounts,
            $this->disputes,
            $this->batches,
        );
        $this->approve = Wiring::approvePayoutBatch(
            $kernel->uow,
            $kernel->ledger,
            $kernel->outbox,
            $kernel->clock,
            $this->batches,
        );
        $this->fail = Wiring::failPayoutBatch(
            $kernel->uow,
            $kernel->ledger,
            $kernel->outbox,
            $kernel->clock,
            $this->batches,
        );
    }

    public function line(
        int $cents = 120_807,
        ?string $orderId = null,
        string $brand = 'capitec',
        string $lastFour = '1234',
        string $sellerId = MoneyFixture::SELLER,
    ): PayoutLineRequest {
        return new PayoutLineRequest(
            sellerId: $sellerId,
            orderId: $orderId ?? $this->money->orderId,
            amount: Money::fromCents($cents),
            bankBrand: $brand,
            bankLastFour: $lastFour,
            oldestPayableAt: new \DateTimeImmutable('2026-11-01T10:00:00+02:00'),
        );
    }

    /**
     * @param list<PayoutLineRequest>|null $lines
     */
    public function prepare(
        string $payoutKey = 'po_batch_1',
        string $preparedBy = 'stf_ana',
        ?array $lines = null,
    ): PayoutBatch {
        return $this->prepare->handle($payoutKey, $preparedBy, $lines ?? [$this->line()]);
    }

    /**
     * @return list<array<string,mixed>>
     */
    public function payoutLedgerRows(): array
    {
        return array_values(array_filter(
            $this->money->kernel->ledger->entriesForSeller(MoneyFixture::SELLER),
            static fn (array $row): bool => (string) $row['entry_type'] === 'PAYOUT',
        ));
    }

    public function balanceCents(): int
    {
        return $this->money->kernel->ledger->sellerBalance(MoneyFixture::SELLER)->cents;
    }
}
