<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Static factories for the composition root. Wiring decides construction
 * order, never a rule; `Application/Kernel.php` is the only caller and is
 * controller-owned.
 *
 * The secrets are parameters, not constants: the OTP pepper, the IP pepper and
 * the erasure key must differ (they protect different domains), and a factory
 * with a hardcoded default is how the same string ends up in three roles.
 */
final class Wiring
{
    /**
     * Apply Identity's storage constraints to a store. The migration applies
     * the same lists as DDL; IdentityDdlTest compares them in both directions.
     */
    public static function install(Store $store): void
    {
        if ($store instanceof InMemoryStore) {
            Schema::apply($store);
        }
    }

    public static function passwordHasher(): PasswordHasher
    {
        return PasswordHasher::forThisRuntime();
    }

    public static function accounts(Store $store): AccountRepository
    {
        return new InMemoryAccountRepository($store);
    }

    /**
     * @param \Closure(string, array<string,mixed>): list<array<string,mixed>> $query
     * @param \Closure(string, array<string,mixed>): int $execute
     */
    public static function sqlAccounts(\Closure $query, \Closure $execute): AccountRepository
    {
        return new SqlAccountRepository($query, $execute);
    }

    public static function sessionRegistry(
        Store $store,
        Clock $clock,
        AccountRepository $accounts,
        \DateInterval $sessionWindow,
        string $ipPepper,
    ): SessionRegistry {
        return new StoreSessionRegistry($store, $clock, $accounts, $sessionWindow, $ipPepper);
    }

    public static function authorisation(AccountRepository $accounts): Authorisation
    {
        return new Authorisation($accounts);
    }

    public static function credentials(Store $store): CredentialStore
    {
        return new CredentialStore($store);
    }

    public static function otpChallenges(Store $store): OtpChallengeStore
    {
        return new OtpChallengeStore($store);
    }

    public static function contactChannels(Store $store): ContactChannelStore
    {
        return new ContactChannelStore($store);
    }

    public static function addresses(Store $store): AddressBookStore
    {
        return new AddressBookStore($store);
    }

    public static function impersonationLog(Store $store): ImpersonationLogStore
    {
        return new ImpersonationLogStore($store);
    }

    public static function erasureRecords(Store $store): ErasureRecordStore
    {
        return new ErasureRecordStore($store);
    }

    public static function registerAccount(
        AccountRepository $accounts,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): RegisterAccount {
        return new RegisterAccount($accounts, $uow, $outbox, $clock);
    }

    public static function login(
        AccountRepository $accounts,
        CredentialStore $credentials,
        PasswordHasher $hasher,
        SessionRegistry $sessions,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): Login {
        return new Login(
            $accounts,
            $credentials,
            $hasher,
            $sessions,
            $uow,
            $outbox,
            $clock,
            new \DateInterval('PT15M'),
        );
    }

    public static function setPassword(
        AccountRepository $accounts,
        CredentialStore $credentials,
        PasswordHasher $hasher,
        SessionRegistry $sessions,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): SetPassword {
        return new SetPassword($accounts, $credentials, $hasher, $sessions, $uow, $outbox, $clock);
    }

    public static function requestOtp(
        AccountRepository $accounts,
        OtpChallengeStore $challenges,
        ContactChannelStore $channels,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
        string $otpPepper,
    ): RequestOtp {
        return new RequestOtp($accounts, $challenges, $channels, $uow, $outbox, $clock, $otpPepper);
    }

    public static function redeemOtp(
        AccountRepository $accounts,
        OtpChallengeStore $challenges,
        ContactChannelStore $channels,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
        string $otpPepper,
    ): RedeemOtp {
        return new RedeemOtp($accounts, $challenges, $channels, $uow, $outbox, $clock, $otpPepper);
    }

    public static function loginWithOtp(
        AccountRepository $accounts,
        SessionRegistry $sessions,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): LoginWithOtp {
        return new LoginWithOtp($accounts, $sessions, $uow, $outbox, $clock);
    }

    public static function resetPassword(SetPassword $setPassword): ResetPassword
    {
        return new ResetPassword($setPassword);
    }

    public static function addContactChannel(
        AccountRepository $accounts,
        ContactChannelStore $channels,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): AddContactChannel {
        return new AddContactChannel($accounts, $channels, $uow, $outbox, $clock);
    }

    public static function recordContactConsent(
        ContactChannelStore $channels,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): RecordContactConsent {
        return new RecordContactConsent($channels, $uow, $outbox, $clock);
    }

    public static function addAddress(
        AddressBookStore $addresses,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): AddAddress {
        return new AddAddress($addresses, $uow, $outbox, $clock);
    }

    public static function setDefaultAddress(
        AddressBookStore $addresses,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): SetDefaultAddress {
        return new SetDefaultAddress($addresses, $uow, $outbox, $clock);
    }

    public static function assignRole(
        AccountRepository $accounts,
        Authorisation $authorisation,
        SessionRegistry $sessions,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): AssignRole {
        return new AssignRole($accounts, $authorisation, $sessions, $uow, $outbox, $clock);
    }

    public static function recordTierGrant(
        AccountRepository $accounts,
        Authorisation $authorisation,
        SessionRegistry $sessions,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): RecordTierGrant {
        return new RecordTierGrant($accounts, $authorisation, $sessions, $uow, $outbox, $clock);
    }

    public static function impersonate(
        AccountRepository $accounts,
        Authorisation $authorisation,
        SessionRegistry $sessions,
        ImpersonationLogStore $log,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): Impersonate {
        return new Impersonate($accounts, $authorisation, $sessions, $log, $uow, $outbox, $clock);
    }

    public static function endImpersonation(
        ImpersonationLogStore $log,
        SessionRegistry $sessions,
        Authorisation $authorisation,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): EndImpersonation {
        return new EndImpersonation($log, $sessions, $authorisation, $uow, $outbox, $clock);
    }

    public static function eraseSubject(
        AccountRepository $accounts,
        CredentialStore $credentials,
        ContactChannelStore $channels,
        AddressBookStore $addresses,
        SessionRegistry $sessions,
        ErasureRecordStore $records,
        PasswordHasher $hasher,
        Authorisation $authorisation,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
        string $erasureKey,
    ): EraseSubject {
        return new EraseSubject(
            $accounts,
            $credentials,
            $channels,
            $addresses,
            $sessions,
            $records,
            $hasher,
            $authorisation,
            $uow,
            $outbox,
            $clock,
            $erasureKey,
        );
    }

    public static function signOut(
        SessionRegistry $sessions,
        UnitOfWork $uow,
        Outbox $outbox,
        Clock $clock,
    ): SignOut {
        return new SignOut($sessions, $uow, $outbox, $clock);
    }
}
