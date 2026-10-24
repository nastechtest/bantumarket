<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The account aggregate: one subject, one row, one version.
 *
 * What Identity knows about a person and nothing about what they may do:
 * capabilities are derived from the role string by Capability, tiers are
 * *stored grants* some other module decided (Account carries the grantor and
 * the time so a stored tier can never masquerade as an earned one), and money
 * is not this module's concern at all.
 *
 * Concurrency is optimistic CAS on `version`, the same shape as Order: the
 * repository refuses to overwrite a row whose stored version is not the one
 * this aggregate was loaded with. An account edit that loses to a concurrent
 * erasure must fail loudly; silently resurrecting anonymised columns is a
 * POPIA breach, not a race bug.
 */
final class Account
{
    public const ROLE_BUYER = 'buyer';
    public const ROLE_SELLER = 'seller';
    public const ROLE_STAFF = 'staff';

    public const STATUS_ACTIVE = 'ACTIVE';
    public const STATUS_SUSPENDED = 'SUSPENDED';
    public const STATUS_ERASED = 'ERASED';

    /**
     * The role vocabulary as the DDL declares it. IdentityDdlTest compares
     * this list against identity.accounts — an invented fourth role fails the
     * build instead of shipping a value the CHECK will refuse at first insert.
     *
     * @var list<string>
     */
    public const ROLES = [self::ROLE_BUYER, self::ROLE_SELLER, self::ROLE_STAFF];

    /** @var list<string> */
    public const STATUSES = [self::STATUS_ACTIVE, self::STATUS_SUSPENDED, self::STATUS_ERASED];

    /** The version this aggregate was loaded with — CAS compares against this. */
    private int $loadedVersion;

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        $account = new self(
            id: (string) $row['id'],
            phoneE164: (string) $row['phone_e164'],
            displayName: $row['display_name'] === null ? null : (string) $row['display_name'],
            role: (string) $row['role'],
            status: (string) $row['status'],
            tier: $row['tier'] === null ? null : SellerTier::from((string) $row['tier']),
            tierGrantedBy: $row['tier_granted_by'] === null ? null : (string) $row['tier_granted_by'],
            tierGrantedAt: $row['tier_granted_at'] === null ? null : new \DateTimeImmutable((string) $row['tier_granted_at']),
            passwordSetAt: $row['password_set_at'] === null ? null : new \DateTimeImmutable((string) $row['password_set_at']),
            version: (int) $row['version'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
            erasedAt: $row['erased_at'] === null ? null : new \DateTimeImmutable((string) $row['erased_at']),
        );
        $account->loadedVersion = (int) $row['version'];

        return $account;
    }

    private function __construct(
        public readonly string $id,
        public string $phoneE164,
        public ?string $displayName,
        public string $role,
        public string $status,
        public ?SellerTier $tier,
        public ?string $tierGrantedBy,
        public ?\DateTimeImmutable $tierGrantedAt,
        public ?\DateTimeImmutable $passwordSetAt,
        public int $version,
        public readonly \DateTimeImmutable $createdAt,
        public ?\DateTimeImmutable $erasedAt,
    ) {
        $this->loadedVersion = $this->version;
    }

    /**
     * A new phone-first account. It starts as a buyer with no tier and no
     * proven channel: those are facts other actors must establish through
     * their own commands, and a constructor that could preset them is the
     * hole that lets a "grant" appear with no grantor.
     */
    public static function register(
        string $id,
        PhoneNumber $phone,
        ?string $displayName,
        \DateTimeImmutable $now,
    ): self {
        if ($phone->isAnonymised()) {
            throw new \InvalidArgumentException('An anonymised phone digest cannot open an account');
        }
        if ($displayName !== null && trim($displayName) === '') {
            throw new \InvalidArgumentException('A display name is either real or absent, never blank');
        }

        return new self(
            id: $id,
            phoneE164: $phone->e164,
            displayName: $displayName,
            role: self::ROLE_BUYER,
            status: self::STATUS_ACTIVE,
            tier: null,
            tierGrantedBy: null,
            tierGrantedAt: null,
            passwordSetAt: null,
            version: 1,
            createdAt: $now,
            erasedAt: null,
        );
    }

    public function loadedVersion(): int
    {
        return $this->loadedVersion;
    }

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    public function markPasswordSet(\DateTimeImmutable $at): void
    {
        $this->assertMutable();
        $this->passwordSetAt = $at;
        $this->version++;
    }

    /**
     * Store a tier grant decided elsewhere. The grantor must be a real actor
     * and must be named: `tier` without `tier_granted_by` is the row the
     * migration's tier_grant_is_a_record_not_a_guess refuses, and the domain
     * refuses it earlier so the caller gets a readable error, not a constraint
     * violation from inside commit().
     */
    public function recordTierGrant(SellerTier $tier, string $grantedByAccountId, \DateTimeImmutable $at): void
    {
        $this->assertMutable();
        if ($grantedByAccountId === '') {
            throw new \InvalidArgumentException('A tier grant names its grantor; Identity stores decisions, it does not invent them');
        }
        $this->tier = $tier;
        $this->tierGrantedBy = $grantedByAccountId;
        $this->tierGrantedAt = $at;
        $this->version++;
    }

    public function assignRole(string $role): void
    {
        $this->assertMutable();
        if (!in_array($role, self::ROLES, true)) {
            throw new \InvalidArgumentException("Unknown role: {$role}");
        }
        $this->role = $role;
        $this->version++;
    }

    public function suspend(): void
    {
        $this->assertMutable();
        $this->status = self::STATUS_SUSPENDED;
        $this->version++;
    }

    /**
     * The POPIA anonymisation, in place. The row survives — id, created_at,
     * role and the tier grant are the ledger-linked facts the law keeps — and
     * every subject-attributing column is either NULLed or replaced by a
     * keyed digest. Erasure is terminal: an erased account has no mutation
     * path back to ACTIVE, and assertMutable() is what says so.
     *
     * @param non-empty-string $erasureKey HMAC key; the digest must not be a
     *                                     bare sha256(phone), which the small
     *                                     space of SA mobile numbers would
     *                                     reverse in an afternoon.
     */
    public function anonymise(string $erasureKey, \DateTimeImmutable $at): void
    {
        $this->assertMutable();
        if (strlen($erasureKey) < 32) {
            throw new \InvalidArgumentException('Erasure key must be at least 32 chars');
        }

        $this->displayName = null;
        $this->phoneE164 = self::anonymised($this->phoneE164, $erasureKey);
        $this->status = self::STATUS_ERASED;
        $this->erasedAt = $at;
        $this->version++;
    }

    public static function anonymised(string $value, string $erasureKey): string
    {
        return 'erased_' . hash_hmac('sha256', $value, $erasureKey);
    }

    private function assertMutable(): void
    {
        if ($this->status === self::STATUS_ERASED) {
            // A domain fact, not an auth failure: nobody is being refused
            // entry, a terminal state is being written against.
            throw new \DomainException('An erased account cannot be changed; it is already anonymised');
        }
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'phone_e164' => $this->phoneE164,
            'display_name' => $this->displayName,
            'role' => $this->role,
            'status' => $this->status,
            'tier' => $this->tier?->value,
            'tier_granted_by' => $this->tierGrantedBy,
            'tier_granted_at' => $this->tierGrantedAt?->format(\DateTimeInterface::ATOM),
            'password_set_at' => $this->passwordSetAt?->format(\DateTimeInterface::ATOM),
            'version' => $this->version,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
            'erased_at' => $this->erasedAt?->format(\DateTimeInterface::ATOM),
        ];
    }
}
