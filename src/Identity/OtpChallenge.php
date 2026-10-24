<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * A one-time code challenge: the digest of a six-digit SMS code, its claim
 * key, its scope, its counter.
 *
 * The code never touches storage — only `hash_hmac('sha256', "<id>.<code>",
 * pepper)`, salted by the challenge id so two live challenges that happen to
 * carry the same code do not produce comparable rows. Comparison is
 * hash_equals, constant-time: an OTP digest comparison that leaks which prefix
 * matched first is a countdown oracle over 10^6 codes, and unlike a password
 * the code is short-lived but *high-volume* guessable.
 *
 * The counter locks at MAX_ATTEMPTS and — unlike a credential — a locked
 * challenge answers exactly like a wrong code and like an unknown claim key:
 * the same AuthFailed::invalidOtp(), plus the same dummy hash_equals on every
 * rejecting path. IndistinguishableResponsesTest proves it.
 */
final class OtpChallenge
{
    public const MAX_ATTEMPTS = 5;

    public const SCOPE_LOGIN = 'login';
    public const SCOPE_PASSWORD_RESET = 'password.reset';
    public const SCOPE_CHANNEL_PROVEN = 'channel.proven';

    /**
     * The scope vocabulary as the DDL declares it. What a channel.proven
     * redemption produces is the channel's proven flag — a statement about
     * the SIM, never about the person behind it (spec §13.2).
     *
     * @var list<string>
     */
    public const SCOPES = [self::SCOPE_LOGIN, self::SCOPE_PASSWORD_RESET, self::SCOPE_CHANNEL_PROVEN];

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            accountId: (string) $row['account_id'],
            scope: (string) $row['scope'],
            channelId: $row['channel_id'] === null ? null : (string) $row['channel_id'],
            digest: (string) $row['digest'],
            activeClaimKey: $row['active_claim_key'] === null ? null : (string) $row['active_claim_key'],
            attempts: (int) $row['attempts'],
            issuedAt: new \DateTimeImmutable((string) $row['issued_at']),
            expiresAt: new \DateTimeImmutable((string) $row['expires_at']),
            consumedAt: $row['consumed_at'] === null ? null : new \DateTimeImmutable((string) $row['consumed_at']),
        );
    }

    private function __construct(
        public readonly string $id,
        public readonly string $accountId,
        public readonly string $scope,
        public readonly ?string $channelId,
        public readonly string $digest,
        public ?string $activeClaimKey,
        public int $attempts,
        public readonly \DateTimeImmutable $issuedAt,
        public readonly \DateTimeImmutable $expiresAt,
        public ?\DateTimeImmutable $consumedAt,
    ) {
    }

    /**
     * Issue a challenge for a code that has just left the platform in the
     * dispatch. The plaintext code and the plaintext claim key exist only in
     * the returned OtpDispatch — storage sees the two hashes.
     */
    public static function issue(
        string $id,
        string $accountId,
        string $scope,
        ?string $channelId,
        string $code,
        string $claimKeyPlaintext,
        string $pepper,
        \DateTimeImmutable $issuedAt,
        \DateInterval $window,
    ): self {
        if (!in_array($scope, self::SCOPES, true)) {
            throw new \InvalidArgumentException("Unknown OTP scope: {$scope}");
        }
        if ($scope === self::SCOPE_CHANNEL_PROVEN && $channelId === null) {
            throw new \InvalidArgumentException('A channel.proven challenge names the channel it will prove');
        }
        if (!preg_match('/^\d{6}$/', $code)) {
            throw new \InvalidArgumentException('An OTP code is exactly six digits');
        }
        if (strlen($pepper) < 32) {
            throw new \InvalidArgumentException('OTP pepper must be at least 32 chars');
        }

        return new self(
            id: $id,
            accountId: $accountId,
            scope: $scope,
            channelId: $channelId,
            digest: self::derive($id, $code, $pepper),
            activeClaimKey: self::claimKeyHash($claimKeyPlaintext, $pepper),
            attempts: 0,
            issuedAt: $issuedAt,
            expiresAt: $issuedAt->add($window),
            consumedAt: null,
        );
    }

    public static function derive(string $challengeId, string $code, string $pepper): string
    {
        return hash_hmac('sha256', $challengeId . '.' . $code, $pepper);
    }

    /**
     * The claim key is a bearer secret like a session token, so it is stored as
     * a one-way digest and looked up by that digest — no KDF, because 256 bits
     * of CSPRNG output is not brute-forceable. It is keyed with the same pepper
     * as the code digest so a bare database read yields no joinable key.
     */
    public static function claimKeyHash(string $claimKeyPlaintext, string $pepper): string
    {
        return hash_hmac('sha256', $claimKeyPlaintext, $pepper);
    }

    /**
     * Constant-time check of a candidate code against the stored digest.
     * `true` is only meaningful together with isRedeemableAt() — a correct
     * code on a locked challenge still ends in rejection, by the same one
     * string, on purpose.
     */
    public function matches(string $code, string $pepper): bool
    {
        return hash_equals($this->digest, self::derive($this->id, $code, $pepper));
    }

    public function isRedeemableAt(\DateTimeImmutable $now): bool
    {
        return $this->consumedAt === null
            && $this->activeClaimKey !== null
            && $now < $this->expiresAt
            && $this->attempts < self::MAX_ATTEMPTS;
    }

    /**
     * Burn one attempt. Unlike a handover PIN rejection this may throw away
     * the challenge: at five it is locked and the subject re-requests — the
     * SMS channel's rate limit is the platform's, not this row's problem.
     */
    public function recordFailure(): void
    {
        if ($this->attempts >= self::MAX_ATTEMPTS) {
            throw new \DomainException('Challenge is at the attempt ceiling');
        }
        $this->attempts++;
    }

    public function consume(\DateTimeImmutable $now): void
    {
        if (!$this->isRedeemableAt($now)) {
            throw new \DomainException('Challenge is no longer redeemable');
        }
        $this->consumedAt = $now;
        // NULL frees the unique claim slot: otp_pending_needs_claim_key keeps
        // pending rows claimable, and Postgres's many-NULLs rule is exactly
        // "one live challenge per key".
        $this->activeClaimKey = null;
    }

    /**
     * Retire a challenge without redeeming it, because a newer code was
     * requested for the same account and scope. This is deliberately allowed
     * on an expired or locked challenge: the point is that the old code stops
     * being accepted, and leaving two live claim keys is the state where "the
     * first SMS still works" becomes both a support ticket and a window.
     */
    public function supersede(\DateTimeImmutable $now): void
    {
        if ($this->consumedAt !== null) {
            return;
        }
        $this->consumedAt = $now;
        $this->activeClaimKey = null;
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'account_id' => $this->accountId,
            'scope' => $this->scope,
            'channel_id' => $this->channelId,
            'digest' => $this->digest,
            'active_claim_key' => $this->activeClaimKey,
            'attempts' => $this->attempts,
            'issued_at' => $this->issuedAt->format(\DateTimeInterface::ATOM),
            'expires_at' => $this->expiresAt->format(\DateTimeInterface::ATOM),
            'consumed_at' => $this->consumedAt?->format(\DateTimeInterface::ATOM),
        ];
    }
}
