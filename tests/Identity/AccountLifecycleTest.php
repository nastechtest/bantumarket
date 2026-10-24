<?php

declare(strict_types=1);

namespace NasTech\Tests\Identity;

use NasTech\Identity\Account;
use NasTech\Identity\SellerTier;
use NasTech\Identity\StaleAccountVersion;
use NasTech\Tests\TestCase;

final class AccountLifecycleTest extends TestCase
{
    private IdentityFixture $fx;

    public function setUp(): void
    {
        $this->fx = new IdentityFixture();
    }

    public function testANewAccountIsABuyerWithNoPasswordTierOrProvenChannel(): void
    {
        $account = $this->fx->account();

        $this->assertSame(Account::ROLE_BUYER, $account->role);
        $this->assertSame(Account::STATUS_ACTIVE, $account->status);
        $this->assertSame(null, $account->passwordSetAt);
        $this->assertSame(null, $account->tier);
        $this->assertSame(1, $account->version);
    }

    public function testRegistrationRefusesAnAnonymisedPhoneDigest(): void
    {
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $this->fx->account('erased_' . str_repeat('b', 64)),
            'anonymised',
        );
    }

    public function testABlankDisplayNameIsRefusedRatherThanStoredAsWhitespace(): void
    {
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $this->fx->account(IdentityFixture::PHONE, '   '),
            'never blank',
        );
    }

    public function testATierWithoutANamedGrantorIsRefused(): void
    {
        $account = $this->fx->account();

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $account->recordTierGrant(SellerTier::T2, '', $this->fx->clock->now()),
            'names its grantor',
        );
    }

    public function testATierGrantRecordsTheActorAndTheInstant(): void
    {
        $seller = $this->fx->account();
        $staff = $this->fx->actor();
        $this->fx->tierGrant->handle($staff->id, $seller->id, SellerTier::T3);

        $stored = $this->fx->accounts->require($seller->id);
        $this->assertSame(SellerTier::T3, $stored->tier);
        $this->assertSame($staff->id, $stored->tierGrantedBy);
        $this->assertSame($this->fx->clock->now()->getTimestamp(), $stored->tierGrantedAt?->getTimestamp());
    }

    public function testAnUnknownRoleIsRefused(): void
    {
        $account = $this->fx->account();

        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => $account->assignRole('superuser'),
            'Unknown role',
        );
    }

    public function testAnErasedAccountIsTerminalAndCannotBeChanged(): void
    {
        $account = $this->fx->account();
        $account->anonymise(IdentityFixture::ERASURE_KEY, $this->fx->clock->now());

        $this->assertSame(Account::STATUS_ERASED, $account->status);
        $this->assertThrows(
            \DomainException::class,
            fn () => $account->markPasswordSet($this->fx->clock->now()),
            'erased account cannot be changed',
        );
    }

    public function testAnonymisationKeepsTheIdAndHashesThePhone(): void
    {
        $account = $this->fx->account();
        $id = $account->id;
        $createdAt = $account->createdAt;

        $account->anonymise(IdentityFixture::ERASURE_KEY, $this->fx->clock->now());

        $this->assertSame($id, $account->id, 'the id is the ledger join and must survive');
        $this->assertSame($createdAt, $account->createdAt);
        $this->assertSame(null, $account->displayName);
        $this->assertTrue(str_starts_with($account->phoneE164, 'erased_'));
        $this->assertSame(64, strlen(substr($account->phoneE164, strlen('erased_'))));
        $this->assertNotSame('+27821234567', $account->phoneE164);
    }

    public function testAStaleAggregateCannotOverwriteANewerRow(): void
    {
        $first = $this->fx->account();
        $second = $this->fx->accounts->require($first->id);

        $first->markPasswordSet($this->fx->clock->now());
        $this->fx->accounts->save($first);

        // The second copy was loaded at version 1 and the store now holds 2.
        $second->markPasswordSet($this->fx->clock->now());

        $this->assertThrows(
            StaleAccountVersion::class,
            fn () => $this->fx->accounts->save($second),
            'refusing to overwrite',
        );
    }
}
