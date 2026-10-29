<?php

declare(strict_types=1);

namespace NasTech\Tests\Safety\Support;

use NasTech\Identity\Account;
use NasTech\Identity\AccountRepository;
use NasTech\Identity\Authorisation;
use NasTech\Identity\PhoneNumber;
use NasTech\Identity\SessionRegistry;
use NasTech\Identity\Wiring as IdentityWiring;
use NasTech\Safety\SafetyRepository;
use NasTech\Safety\SafetyService;
use NasTech\Safety\Wiring as SafetyWiring;
use NasTech\SharedKernel\FrozenClock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\InMemoryUnitOfWork;

/**
 * One wired Safety module with time frozen, and the Identity ports it names.
 *
 * Accounts are created through Identity's aggregate and repository because the
 * Safety rules under test are about real accounts — a sanction checks that its
 * target exists, and a ban revokes that account's sessions through Identity's
 * SessionRegistry. The Identity schema is deliberately not installed on the
 * store: Safety's Schema::apply() would replace its lists, and what these tests
 * need is the account aggregate and session port, not Identity's DDL.
 */
final class SafetyFixture
{
    public const IP_PEPPER = 'test-ip-pepper-0123456789abcdefghijk';

    public readonly InMemoryStore $store;
    public readonly InMemoryUnitOfWork $uow;
    public readonly FrozenClock $clock;
    public readonly Outbox $outbox;
    public readonly AccountRepository $accounts;
    public readonly SessionRegistry $sessions;
    public readonly Authorisation $authorisation;
    public readonly SafetyRepository $repository;
    public readonly SafetyService $service;

    public readonly Account $reporter;
    public readonly Account $reported;
    public readonly Account $staff;
    public readonly Account $staffTwo;
    public readonly Account $stranger;

    public function __construct()
    {
        $this->store = new InMemoryStore();
        SafetyWiring::install($this->store);
        $this->uow = new InMemoryUnitOfWork($this->store);
        $this->clock = FrozenClock::at('2026-11-02T09:00:00+02:00');
        $this->outbox = new Outbox($this->store, $this->uow, $this->clock);

        $this->accounts = IdentityWiring::accounts($this->store);
        $this->sessions = IdentityWiring::sessionRegistry(
            $this->store,
            $this->clock,
            $this->accounts,
            new \DateInterval('PT12H'),
            self::IP_PEPPER,
        );
        $this->authorisation = IdentityWiring::authorisation($this->accounts);
        $this->repository = SafetyWiring::repository($this->store);
        $this->service = SafetyWiring::service(
            $this->repository,
            $this->uow,
            $this->outbox,
            $this->clock,
            $this->accounts,
            $this->sessions,
            $this->authorisation,
        );

        $this->reporter = $this->account('acc_reporter', '082 123 4567', 'Reporter');
        $this->reported = $this->account('acc_reported', '083 765 4321', 'Reported Seller');
        $this->staff = $this->account('acc_staff', '084 000 0001', 'Safety Staff', Account::ROLE_STAFF);
        $this->staffTwo = $this->account('acc_staff_two', '084 000 0002', 'Second Checker', Account::ROLE_STAFF);
        $this->stranger = $this->account('acc_stranger', '085 000 0003', 'Stranger');
    }

    public function futureExpiry(string $interval = 'P30D'): \DateTimeImmutable
    {
        return $this->clock->now()->add(new \DateInterval($interval));
    }

    private function account(string $id, string $phone, string $name, ?string $role = null): Account
    {
        $account = Account::register($id, PhoneNumber::fromString($phone), $name, $this->clock->now());
        if ($role !== null) {
            $account->assignRole($role);
        }
        $this->accounts->save($account);

        return $this->accounts->require($id);
    }
}
