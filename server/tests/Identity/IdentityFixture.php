<?php

declare(strict_types=1);

namespace NasTech\Tests\Identity;

use NasTech\Identity\Account;
use NasTech\Identity\AccountRepository;
use NasTech\Identity\AddAddress;
use NasTech\Identity\AddContactChannel;
use NasTech\Identity\AddressBookStore;
use NasTech\Identity\AssignRole;
use NasTech\Identity\Authorisation;
use NasTech\Identity\ContactChannelStore;
use NasTech\Identity\CredentialStore;
use NasTech\Identity\EndImpersonation;
use NasTech\Identity\EraseSubject;
use NasTech\Identity\ErasureRecordStore;
use NasTech\Identity\Impersonate;
use NasTech\Identity\ImpersonationLogStore;
use NasTech\Identity\Login;
use NasTech\Identity\LoginWithOtp;
use NasTech\Identity\OtpChallengeStore;
use NasTech\Identity\PasswordHasher;
use NasTech\Identity\RecordContactConsent;
use NasTech\Identity\RecordTierGrant;
use NasTech\Identity\RedeemOtp;
use NasTech\Identity\RegisterAccount;
use NasTech\Identity\RequestOtp;
use NasTech\Identity\ResetPassword;
use NasTech\Identity\SessionRegistry;
use NasTech\Identity\SetDefaultAddress;
use NasTech\Identity\SetPassword;
use NasTech\Identity\SignOut;
use NasTech\Identity\Wiring;
use NasTech\SharedKernel\FrozenClock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\InMemoryUnitOfWork;

/**
 * One wired Identity module with time frozen. Every test starts here so that
 * what varies between tests is the thing being asserted, never the setup.
 *
 * The fixture uses the module's public commands for every write a test
 * observes. Role bootstrapping is the one exception: the first staff account
 * cannot appoint itself, so `actor()` registers and assigns the role directly,
 * exactly as a seed script would.
 */
final class IdentityFixture
{
    public const OTP_PEPPER = 'test-otp-pepper-0123456789abcdefghij';
    public const IP_PEPPER = 'test-ip-pepper-0123456789abcdefghijk';
    public const ERASURE_KEY = 'test-erasure-key-0123456789abcdefgh';
    public const PHONE = '082 123 4567';
    public const OTHER_PHONE = '083 765 4321';
    public const PASSWORD = 'correct-horse-battery-staple';

    public readonly InMemoryStore $store;
    public readonly InMemoryUnitOfWork $uow;
    public readonly FrozenClock $clock;
    public readonly Outbox $outbox;
    public readonly AccountRepository $accounts;
    public readonly PasswordHasher $hasher;
    public readonly SessionRegistry $sessions;
    public readonly Authorisation $authorisation;
    public readonly CredentialStore $credentials;
    public readonly OtpChallengeStore $challenges;
    public readonly ContactChannelStore $channels;
    public readonly AddressBookStore $addresses;
    public readonly ImpersonationLogStore $impersonationLog;
    public readonly ErasureRecordStore $erasureRecords;

    public readonly RegisterAccount $register;
    public readonly Login $login;
    public readonly SetPassword $setPassword;
    public readonly ResetPassword $resetPassword;
    public readonly RequestOtp $requestOtp;
    public readonly RedeemOtp $redeemOtp;
    public readonly LoginWithOtp $loginWithOtp;
    public readonly AddContactChannel $addChannel;
    public readonly RecordContactConsent $consent;
    public readonly AddAddress $addAddress;
    public readonly SetDefaultAddress $setDefaultAddress;
    public readonly AssignRole $assignRole;
    public readonly RecordTierGrant $tierGrant;
    public readonly Impersonate $impersonate;
    public readonly EndImpersonation $endImpersonation;
    public readonly EraseSubject $erase;
    public readonly SignOut $signOut;

    public function __construct()
    {
        $this->store = new InMemoryStore();
        Wiring::install($this->store);
        $this->uow = new InMemoryUnitOfWork($this->store);
        $this->clock = FrozenClock::at('2026-11-02T09:00:00+02:00');
        $this->outbox = new Outbox($this->store, $this->uow, $this->clock);

        $this->accounts = Wiring::accounts($this->store);
        $this->hasher = Wiring::passwordHasher();
        $this->sessions = Wiring::sessionRegistry(
            $this->store,
            $this->clock,
            $this->accounts,
            new \DateInterval('PT12H'),
            self::IP_PEPPER,
        );
        $this->authorisation = Wiring::authorisation($this->accounts);
        $this->credentials = Wiring::credentials($this->store);
        $this->challenges = Wiring::otpChallenges($this->store);
        $this->channels = Wiring::contactChannels($this->store);
        $this->addresses = Wiring::addresses($this->store);
        $this->impersonationLog = Wiring::impersonationLog($this->store);
        $this->erasureRecords = Wiring::erasureRecords($this->store);

        $this->register = Wiring::registerAccount($this->accounts, $this->uow, $this->outbox, $this->clock);
        $this->login = Wiring::login(
            $this->accounts,
            $this->credentials,
            $this->hasher,
            $this->sessions,
            $this->uow,
            $this->outbox,
            $this->clock,
        );
        $this->setPassword = Wiring::setPassword(
            $this->accounts,
            $this->credentials,
            $this->hasher,
            $this->sessions,
            $this->uow,
            $this->outbox,
            $this->clock,
        );
        $this->resetPassword = Wiring::resetPassword($this->setPassword);
        $this->requestOtp = Wiring::requestOtp(
            $this->accounts,
            $this->challenges,
            $this->channels,
            $this->uow,
            $this->outbox,
            $this->clock,
            self::OTP_PEPPER,
        );
        $this->redeemOtp = Wiring::redeemOtp(
            $this->accounts,
            $this->challenges,
            $this->channels,
            $this->uow,
            $this->outbox,
            $this->clock,
            self::OTP_PEPPER,
        );
        $this->loginWithOtp = Wiring::loginWithOtp(
            $this->accounts,
            $this->sessions,
            $this->uow,
            $this->outbox,
            $this->clock,
        );
        $this->addChannel = Wiring::addContactChannel(
            $this->accounts,
            $this->channels,
            $this->uow,
            $this->outbox,
            $this->clock,
        );
        $this->consent = Wiring::recordContactConsent($this->channels, $this->uow, $this->outbox, $this->clock);
        $this->addAddress = Wiring::addAddress($this->addresses, $this->uow, $this->outbox, $this->clock);
        $this->setDefaultAddress = Wiring::setDefaultAddress($this->addresses, $this->uow, $this->outbox, $this->clock);
        $this->assignRole = Wiring::assignRole(
            $this->accounts,
            $this->authorisation,
            $this->sessions,
            $this->uow,
            $this->outbox,
            $this->clock,
        );
        $this->tierGrant = Wiring::recordTierGrant(
            $this->accounts,
            $this->authorisation,
            $this->sessions,
            $this->uow,
            $this->outbox,
            $this->clock,
        );
        $this->impersonate = Wiring::impersonate(
            $this->accounts,
            $this->authorisation,
            $this->sessions,
            $this->impersonationLog,
            $this->uow,
            $this->outbox,
            $this->clock,
        );
        $this->endImpersonation = Wiring::endImpersonation(
            $this->impersonationLog,
            $this->sessions,
            $this->authorisation,
            $this->uow,
            $this->outbox,
            $this->clock,
        );
        $this->erase = Wiring::eraseSubject(
            $this->accounts,
            $this->credentials,
            $this->channels,
            $this->addresses,
            $this->sessions,
            $this->erasureRecords,
            $this->hasher,
            $this->authorisation,
            $this->uow,
            $this->outbox,
            $this->clock,
            self::ERASURE_KEY,
        );
        $this->signOut = Wiring::signOut($this->sessions, $this->uow, $this->outbox, $this->clock);
    }

    public function account(string $phone = self::PHONE, ?string $name = 'Thandi Mokoena'): Account
    {
        return $this->register->handle($phone, $name);
    }

    /**
     * A ready-to-sign-in account: registered, password set, one proven phone
     * channel.
     */
    public function member(string $phone = self::PHONE): Account
    {
        $account = $this->account($phone);
        $this->setPassword->handle($account->id, self::PASSWORD);

        return $this->accounts->require($account->id);
    }

    /**
     * A staff account for command-authorisation tests. Direct role assignment
     * is the seed script's job, not a command a new account may call.
     */
    public function actor(string $role = Account::ROLE_STAFF, string $phone = '084 000 0001'): Account
    {
        $account = $this->account($phone, null);
        $account->assignRole($role);
        $this->accounts->save($account);

        return $this->accounts->require($account->id);
    }

    public function signedIn(Account $account): \NasTech\Identity\AuthenticatedSession
    {
        $this->clock->advance('PT1M');

        return $this->sessions->authenticate($this->login->handle($account->phoneE164, self::PASSWORD)->token);
    }

    public function provePhone(Account $account): string
    {
        $channel = $this->addChannel->handle($account->id, \NasTech\Identity\ChannelType::PHONE, $account->phoneE164);
        $dispatch = $this->requestOtp->handle($account->id, \NasTech\Identity\OtpChallenge::SCOPE_CHANNEL_PROVEN, $channel->id);
        $this->redeemOtp->handle($dispatch->claimKey, $dispatch->code);

        return $channel->id;
    }

    public function nextPhone(): string
    {
        static $n = 0;
        $n++;

        return sprintf('081 555 %04d', $n);
    }
}
