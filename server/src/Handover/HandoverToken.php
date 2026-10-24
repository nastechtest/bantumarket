<?php

declare(strict_types=1);

namespace NasTech\Handover;

use NasTech\SharedKernel\Money;

/**
 * A handover token proves that both parties attended the exchange.
 *
 * The PIN is never stored: only a keyed hash of it, salted with the token id so
 * two orders with the same PIN do not produce a comparable row. A database dump
 * therefore yields neither the PINs nor a way to check a guess against many
 * orders at once.
 *
 * Confirmation is two-sided on purpose. The order advances only when buyer and
 * seller have each presented the PIN, which is what stops a shoulder-surfed code
 * from releasing money.
 */
final class HandoverToken
{
    public const MAX_ATTEMPTS = 5;

    private function __construct(
        public readonly string $id,
        public readonly string $orderId,
        public readonly string $buyerId,
        public readonly string $sellerId,
        public readonly \DateTimeImmutable $issuedAt,
        public readonly \DateTimeImmutable $expiresAt,
        private readonly string $pinHash,
        public bool $buyerConfirmed = false,
        public bool $sellerConfirmed = false,
        public ?\DateTimeImmutable $confirmedAt = null,
        public int $attempts = 0,
        public bool $locked = false,
        public bool $revoked = false,
        public readonly int $heldCents = 0,
        public readonly string $currency = 'ZAR',
    ) {
    }

    public static function issue(
        string $id,
        string $orderId,
        string $pin,
        string $pepper,
        string $buyerId,
        string $sellerId,
        \DateTimeImmutable $issuedAt,
        \DateTimeImmutable $expiresAt,
        Money $heldValue,
    ): self {
        return new self(
            id: $id,
            orderId: $orderId,
            buyerId: $buyerId,
            sellerId: $sellerId,
            issuedAt: $issuedAt,
            expiresAt: $expiresAt,
            pinHash: self::derive($id, $pin, $pepper),
            heldCents: $heldValue->cents,
            currency: $heldValue->currency,
        );
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            orderId: (string) $row['order_id'],
            buyerId: (string) $row['buyer_id'],
            sellerId: (string) $row['seller_id'],
            issuedAt: new \DateTimeImmutable((string) $row['issued_at']),
            expiresAt: new \DateTimeImmutable((string) $row['expires_at']),
            pinHash: (string) $row['pin_hash'],
            buyerConfirmed: (bool) $row['buyer_confirmed'],
            sellerConfirmed: (bool) $row['seller_confirmed'],
            confirmedAt: $row['confirmed_at'] === null ? null : new \DateTimeImmutable((string) $row['confirmed_at']),
            attempts: (int) $row['attempts'],
            locked: (bool) $row['locked'],
            revoked: (bool) $row['revoked'],
            heldCents: (int) $row['held_cents'],
            currency: (string) $row['currency'],
        );
    }

    public static function derive(string $tokenId, string $pin, string $pepper): string
    {
        if (!preg_match('/^\d{6}$/', $pin)) {
            throw new HandoverRejected('A handover PIN is exactly six digits');
        }
        if (strlen($pepper) < 32) {
            throw new \InvalidArgumentException('Handover pepper must be at least 32 chars');
        }

        return hash_hmac('sha256', $tokenId . '.' . $pin, $pepper);
    }

    public function matches(string $pin, string $pepper): bool
    {
        return hash_equals($this->pinHash, self::derive($this->id, $pin, $pepper));
    }

    public function isExpired(\DateTimeImmutable $at): bool
    {
        return $at >= $this->expiresAt;
    }

    public function isComplete(): bool
    {
        return $this->buyerConfirmed && $this->sellerConfirmed;
    }

    public function isUsable(\DateTimeImmutable $at): bool
    {
        return !$this->revoked && !$this->locked && !$this->isComplete() && !$this->isExpired($at);
    }

    public function heldValue(): Money
    {
        return Money::fromCents($this->heldCents, $this->currency);
    }

    /**
     * Record one presentation of the PIN by one role.
     *
     * A wrong PIN is not an exception: it is a state change that has to be
     * committed, because the attempt counter is the only thing standing between a
     * six-digit code and a million guesses. Throwing here would roll the counter
     * back and hand the attacker an unlimited number of tries.
     */
    public function present(string $role, string $pin, string $pepper, \DateTimeImmutable $at): bool
    {
        if (!in_array($role, ['buyer', 'seller'], true)) {
            throw new \InvalidArgumentException("Unknown handover role: {$role}");
        }
        if (!$this->isUsable($at)) {
            throw new HandoverRejected($this->unusableReason($at));
        }
        if (($role === 'buyer' && $this->buyerConfirmed) || ($role === 'seller' && $this->sellerConfirmed)) {
            throw new HandoverRejected("The {$role} has already confirmed this handover");
        }

        if (!$this->matches($pin, $pepper)) {
            $this->attempts++;
            if ($this->attempts >= self::MAX_ATTEMPTS) {
                $this->locked = true;
            }

            return false;
        }

        if ($role === 'buyer') {
            $this->buyerConfirmed = true;
        } else {
            $this->sellerConfirmed = true;
        }
        if ($this->isComplete()) {
            $this->confirmedAt = $at;
        }

        return true;
    }

    public function unusableReason(\DateTimeImmutable $at): string
    {
        if ($this->revoked) {
            return 'This handover token was revoked';
        }
        if ($this->locked) {
            return 'This handover token is locked after failed attempts';
        }
        if ($this->isComplete()) {
            return 'This handover has already been confirmed by both parties';
        }
        if ($this->isExpired($at)) {
            return 'This handover window has closed; reschedule the exchange';
        }

        return 'This handover token is not usable';
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'order_id' => $this->orderId,
            'pin_hash' => $this->pinHash,
            'buyer_id' => $this->buyerId,
            'seller_id' => $this->sellerId,
            'issued_at' => $this->issuedAt->format(\DateTimeInterface::ATOM),
            'expires_at' => $this->expiresAt->format(\DateTimeInterface::ATOM),
            'buyer_confirmed' => $this->buyerConfirmed,
            'seller_confirmed' => $this->sellerConfirmed,
            'confirmed_at' => $this->confirmedAt?->format(\DateTimeInterface::ATOM),
            'attempts' => $this->attempts,
            'locked' => $this->locked,
            'revoked' => $this->revoked,
            'held_cents' => $this->heldCents,
            'currency' => $this->currency,
        ];
    }
}
