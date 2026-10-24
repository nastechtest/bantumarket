<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * One account's password credential: digest, algo tag, attempt counter and
 * cost ladder. Separate from Account because the row's failure mode is
 * different — an account is who you are, a credential is the secret you
 * present, and erasure destroys the second while anonymising the first.
 *
 * The counter *locks*; it never *leaks*. recordFailure() answers "how many
 * tries are left" only in the committed row and the outbox event, never in
 * the response — an attacker who can read attemptsRemaining can tune a
 * guessing budget, and the marketing surface that would carry it is the same
 * one that would confirm the phone exists.
 */
final class Credential
{
    public const MAX_FAILED_ATTEMPTS = 8;
    public const MAX_LADDER_STEP = 4;

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            accountId: (string) $row['account_id'],
            algo: (string) $row['algo'],
            passwordHash: (string) $row['password_hash'],
            ladderStep: (int) $row['ladder_step'],
            failedAttempts: (int) $row['failed_attempts'],
            lockedUntil: $row['locked_until'] === null ? null : new \DateTimeImmutable((string) $row['locked_until']),
            updatedAt: new \DateTimeImmutable((string) $row['updated_at']),
        );
    }

    private function __construct(
        public readonly string $id,
        public readonly string $accountId,
        public string $algo,
        public string $passwordHash,
        public int $ladderStep,
        public int $failedAttempts,
        public ?\DateTimeImmutable $lockedUntil,
        public \DateTimeImmutable $updatedAt,
    ) {
    }

    public static function create(
        string $id,
        string $accountId,
        PasswordHasher $hasher,
        string $password,
        \DateTimeImmutable $now,
    ): self {
        return new self(
            id: $id,
            accountId: $accountId,
            algo: $hasher->algo(),
            passwordHash: $hasher->hash($password),
            ladderStep: 0,
            failedAttempts: 0,
            lockedUntil: null,
            updatedAt: $now,
        );
    }

    public function isErased(): bool
    {
        return $this->algo === PasswordHasher::ALGO_ERASED;
    }

    public function isLockedAt(\DateTimeImmutable $now): bool
    {
        return $this->lockedUntil !== null && $now < $this->lockedUntil;
    }

    /**
     * Apply one failed check: bump the counter, steepen the ladder, lock at
     * the ceiling. Returns true when this failure is the one that locked the
     * credential, so the caller can emit CredentialLocked exactly once — the
     * event is for the owner's support channel, not for the caller-facing
     * response, which stays the uniform AuthFailed either way.
     */
    public function recordFailure(\DateTimeImmutable $now, \DateInterval $lockWindow): bool
    {
        if ($this->isErased()) {
            throw new \DomainException('An erased credential cannot take attempts; it has no secret left');
        }
        if ($this->failedAttempts >= self::MAX_FAILED_ATTEMPTS) {
            // The DDL check attempts_lock_out_at_eight would refuse this write
            // too; refusing it here gives the caller a readable sentence and
            // keeps the row inside the bound even if a lock-release path ever
            // forgets to zero the counter first.
            throw new \DomainException('Credential is at the attempt ceiling; it must be reset, not ground further');
        }

        $this->failedAttempts++;
        $this->ladderStep = min($this->ladderStep + 1, self::MAX_LADDER_STEP);
        $this->updatedAt = $now;

        if ($this->failedAttempts >= self::MAX_FAILED_ATTEMPTS) {
            $this->lockedUntil = $now->add($lockWindow);

            return true;
        }

        return false;
    }

    public function resetFailures(): void
    {
        $this->failedAttempts = 0;
        $this->ladderStep = 0;
        $this->lockedUntil = null;
    }

    /** A new secret replaces the digest wholesale; ladder and counter start clean. */
    public function replaceSecret(PasswordHasher $hasher, string $password, \DateTimeImmutable $now): void
    {
        $this->algo = $hasher->algo();
        $this->passwordHash = $hasher->hash($password);
        $this->resetFailures();
        $this->updatedAt = $now;
    }

    /** POPIA s.24: destroy the digest by rehashing fresh randomness. Nothing checks against it again. */
    public function anonymise(PasswordHasher $hasher, \DateTimeImmutable $now): void
    {
        $this->algo = PasswordHasher::ALGO_ERASED;
        $this->passwordHash = $hasher->erasedDigest();
        $this->resetFailures();
        $this->updatedAt = $now;
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'account_id' => $this->accountId,
            'algo' => $this->algo,
            'password_hash' => $this->passwordHash,
            'ladder_step' => $this->ladderStep,
            'failed_attempts' => $this->failedAttempts,
            'locked_until' => $this->lockedUntil?->format(\DateTimeInterface::ATOM),
            'updated_at' => $this->updatedAt->format(\DateTimeInterface::ATOM),
        ];
    }
}
