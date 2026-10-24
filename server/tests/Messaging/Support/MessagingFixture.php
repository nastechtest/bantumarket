<?php

declare(strict_types=1);

namespace NasTech\Tests\Messaging\Support;

use NasTech\Identity\Account;
use NasTech\Identity\AccountRepository;
use NasTech\Identity\Authorisation;
use NasTech\Identity\InMemoryAccountRepository;
use NasTech\Identity\PhoneNumber;
use NasTech\Messaging\MessagingRepository;
use NasTech\Messaging\MessagingService;
use NasTech\Messaging\Schema;
use NasTech\Messaging\Thread;
use NasTech\Messaging\Wiring;
use NasTech\SharedKernel\AuditSink\RecordingAuditSink;
use NasTech\SharedKernel\FrozenClock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\InMemoryUnitOfWork;

/**
 * The one fixture every Messaging test builds on. Deliberately uses the same
 * InMemoryStore, schema lists, unit of work and outbox the module ships, so a test
 * cannot pass on a friendlier model than production.
 */
final class MessagingFixture
{
    public readonly InMemoryStore $store;
    public readonly InMemoryUnitOfWork $uow;
    public readonly Outbox $outbox;
    public readonly FrozenClock $clock;
    public readonly AccountRepository $accounts;
    public readonly Authorisation $authorisation;
    public readonly MessagingRepository $repository;
    public readonly MessagingService $service;
    public readonly RecordingAuditSink $audit;

    public function __construct()
    {
        $this->store = new InMemoryStore();
        Schema::apply($this->store);
        $this->clock = FrozenClock::at('2026-10-22T09:00:00+00:00');
        $this->uow = new InMemoryUnitOfWork($this->store);
        $this->outbox = new Outbox($this->store, $this->uow, $this->clock);
        $this->accounts = new InMemoryAccountRepository($this->store);
        $this->authorisation = new Authorisation($this->accounts);
        $this->repository = Wiring::repository($this->store);
        $this->audit = new RecordingAuditSink();
        $this->service = Wiring::service(
            $this->repository,
            $this->uow,
            $this->outbox,
            $this->clock,
            $this->accounts,
            $this->authorisation,
            null,
            $this->audit,
        );

        $this->account('acc_buyer', 'Buyer One', '0821234567', Account::ROLE_BUYER);
        $this->account('acc_seller', 'Seller Two', '0837654321', Account::ROLE_SELLER);
        $this->account('acc_stranger', 'Stranger Three', '0845550100', Account::ROLE_BUYER);
        $this->account('acc_staff', 'Staff Four', '0855550100', Account::ROLE_STAFF);
    }

    private function account(string $id, string $name, string $phone, string $role): void
    {
        $account = Account::register($id, PhoneNumber::fromString($phone), $name, $this->clock->now());
        if ($role !== Account::ROLE_BUYER) {
            $account->assignRole($role);
        }
        $this->accounts->save($account);
    }

    public function openThread(): Thread
    {
        return $this->service->openThread('acc_buyer', 'acc_buyer', 'acc_seller', 'lst_watch_1', null);
    }
}
