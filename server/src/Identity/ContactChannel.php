<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * A contact channel: where a message may be sent, and what the subject agreed
 * to receive there.
 *
 * The only statement of proof this module makes is `provenAt`: an OTP sent to
 * *this address* was redeemed. It is deliberately not called "verified" in
 * PHP, because the vocabulary rule (spec §13.2) reserves that word for exactly
 * this fact and nothing else — the database column keeps the historical name
 * `verified_at`, and a scan test holds every other use of the word out of this
 * module. A proven phone says the SIM receives SMS; it says nothing about the
 * human holding it, their age, their tier or their trustworthiness.
 *
 * Consent is three-valued per purpose: NULL means never asked, true means
 * agreed, false means refused. POPIA treats "never asked" and "refused"
 * differently, and a boolean cannot hold that difference.
 */
final class ContactChannel
{
    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            accountId: (string) $row['account_id'],
            type: ChannelType::from((string) $row['type']),
            target: (string) $row['target'],
            provenAt: $row['verified_at'] === null ? null : new \DateTimeImmutable((string) $row['verified_at']),
            consentMarketing: self::nullableBool($row['consent_marketing']),
            consentTransactional: self::nullableBool($row['consent_transactional']),
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
        );
    }

    private function __construct(
        public readonly string $id,
        public readonly string $accountId,
        public readonly ChannelType $type,
        public string $target,
        public ?\DateTimeImmutable $provenAt,
        public ?bool $consentMarketing,
        public ?bool $consentTransactional,
        public readonly \DateTimeImmutable $createdAt,
    ) {
    }

    public static function create(
        string $id,
        string $accountId,
        ChannelType $type,
        string $target,
        \DateTimeImmutable $now,
    ): self {
        return new self(
            id: $id,
            accountId: $accountId,
            type: $type,
            target: self::normaliseTarget($type, $target),
            provenAt: null,
            consentMarketing: null,
            consentTransactional: null,
            createdAt: $now,
        );
    }

    /**
     * Record that an OTP sent to this address was redeemed. Idempotent by
     * keeping the first proof: re-proving a channel does not extend a consent
     * or reset a history, and the first proof is the one a dispute asks about.
     */
    public function prove(\DateTimeImmutable $at): void
    {
        if ($this->isAnonymised()) {
            throw new \DomainException('An anonymised channel cannot be proven; there is no address left');
        }
        $this->provenAt ??= $at;
    }

    public function recordMarketingConsent(?bool $consented): void
    {
        $this->consentMarketing = $consented;
    }

    public function recordTransactionalConsent(?bool $consented): void
    {
        $this->consentTransactional = $consented;
    }

    public function isProven(): bool
    {
        return $this->provenAt !== null;
    }

    public function isAnonymised(): bool
    {
        return str_starts_with($this->target, 'erased_');
    }

    /**
     * POPIA erasure. The row survives because the platform must still be able
     * to say "this account had a proven phone channel"; the address itself,
     * the proof time and both consent answers are personal data and go.
     */
    public function anonymise(string $erasureKey): void
    {
        if (strlen($erasureKey) < 32) {
            throw new \InvalidArgumentException('Erasure key must be at least 32 chars');
        }
        $this->target = 'erased_' . hash_hmac('sha256', $this->type->value . '|' . $this->target, $erasureKey);
        $this->provenAt = null;
        $this->consentMarketing = null;
        $this->consentTransactional = null;
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'account_id' => $this->accountId,
            'type' => $this->type->value,
            'target' => $this->target,
            'verified_at' => $this->provenAt?->format(\DateTimeInterface::ATOM),
            'consent_marketing' => $this->consentMarketing,
            'consent_transactional' => $this->consentTransactional,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }

    private static function normaliseTarget(ChannelType $type, string $target): string
    {
        $trimmed = trim($target);

        return match ($type) {
            ChannelType::PHONE => PhoneNumber::fromString($trimmed)->e164,
            ChannelType::EMAIL => self::email($trimmed),
            ChannelType::PUSH => self::pushToken($trimmed),
        };
    }

    private static function email(string $target): string
    {
        $lower = strtolower($target);
        if ($lower === '' || !str_contains($lower, '@') || str_contains($lower, ' ')
            || str_starts_with($lower, '@') || str_ends_with($lower, '@')) {
            throw new \InvalidArgumentException('Not an email address: expected one @ with text on both sides');
        }

        return $lower;
    }

    private static function pushToken(string $target): string
    {
        if (strlen($target) < 16) {
            throw new \InvalidArgumentException('A push token is at least 16 characters of device registration');
        }

        return $target;
    }

    private static function nullableBool(mixed $value): ?bool
    {
        if ($value === null) {
            return null;
        }

        return (bool) $value;
    }
}
