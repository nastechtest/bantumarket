<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * A session: an opaque bearer token, kept only as its digest.
 *
 * Deliberately not a JWT. The design carries PII (phone, role, tier) and a
 * token that states who the subject is hands every intermediary a
 * self-describing identity document; a random 256-bit id with the platform
 * holding the row is strictly less to leak, revocable in one write, and small
 * enough to rotate whenever anything about the principal changes.
 *
 * Storage keeps sha256(token) — not argon2: the token is high-entropy by
 * construction, so a fast one-way function is the honest cost, and argon2 on
 * every authenticate would add a KDF where the threat (database dump) gains
 * nothing. Rotation: password reset and role/tier change revoke every session
 * for the account and force reissue; a stolen token dies with them. That is
 * the stolen-token test in tests/Identity/SessionSecurityTest.php.
 */
final class Session
{
    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            accountId: (string) $row['account_id'],
            tokenHash: (string) $row['token_hash'],
            deviceLabel: $row['device_label'] === null ? null : (string) $row['device_label'],
            remoteIpHash: $row['remote_ip_hash'] === null ? null : (string) $row['remote_ip_hash'],
            issuedAt: new \DateTimeImmutable((string) $row['issued_at']),
            expiresAt: new \DateTimeImmutable((string) $row['expires_at']),
            lastSeenAt: $row['last_seen_at'] === null ? null : new \DateTimeImmutable((string) $row['last_seen_at']),
            revokedAt: $row['revoked_at'] === null ? null : new \DateTimeImmutable((string) $row['revoked_at']),
            revokeReason: $row['revoke_reason'] === null ? null : (string) $row['revoke_reason'],
            impersonatedBy: $row['impersonated_by'] === null ? null : (string) $row['impersonated_by'],
            purpose: $row['purpose'] === null ? null : (string) $row['purpose'],
        );
    }

    private function __construct(
        public readonly string $id,
        public readonly string $accountId,
        public readonly string $tokenHash,
        public ?string $deviceLabel,
        public ?string $remoteIpHash,
        public readonly \DateTimeImmutable $issuedAt,
        public readonly \DateTimeImmutable $expiresAt,
        public ?\DateTimeImmutable $lastSeenAt,
        public ?\DateTimeImmutable $revokedAt,
        public ?string $revokeReason,
        public readonly ?string $impersonatedBy,
        public readonly ?string $purpose,
    ) {
    }

    /**
     * Begin a session. The plaintext token is minted by the caller through
     * Session::token() and leaves once through IssuedSession; nothing above
     * this class sees it again, and storage never holds it.
     *
     * @param non-empty-string $ipPepper keyed hash for the remote address; the
     *                                    raw IP is personal data and stays out.
     */
    public static function begin(
        string $id,
        string $accountId,
        ?string $deviceLabel,
        ?string $remoteIp,
        string $ipPepper,
        \DateTimeImmutable $now,
        \DateInterval $window,
        string $token,
    ): self {
        return new self(
            id: $id,
            accountId: $accountId,
            tokenHash: self::hashToken($token),
            deviceLabel: $deviceLabel,
            remoteIpHash: $remoteIp === null
                ? null
                : hash_hmac('sha256', $remoteIp, self::assertPepper($ipPepper)),
            issuedAt: $now,
            expiresAt: $now->add($window),
            lastSeenAt: null,
            revokedAt: null,
            revokeReason: null,
            impersonatedBy: null,
            purpose: null,
        );
    }

    /**
     * An impersonation session: bound to the target account but stamped with
     * who is acting, with a stated purpose, and expiring no later than the
     * staff session it was launched from *and* no later than the module's
     * hard window — the bound is min(window, parentExpiry-now) and the audit
     * row is written by the Impersonation command that calls this.
     */
    public static function beginImpersonated(
        string $id,
        string $targetAccountId,
        string $staffAccountId,
        string $purpose,
        ?string $deviceLabel,
        ?string $remoteIp,
        string $ipPepper,
        \DateTimeImmutable $now,
        \DateTimeImmutable $hardExpiry,
        string $token,
    ): self {
        if (trim($purpose) === '') {
            throw new \InvalidArgumentException(
                'An impersonation states its purpose; "investigating" alone is not one'
            );
        }

        return new self(
            id: $id,
            accountId: $targetAccountId,
            tokenHash: self::hashToken($token),
            deviceLabel: $deviceLabel,
            remoteIpHash: $remoteIp === null
                ? null
                : hash_hmac('sha256', $remoteIp, self::assertPepper($ipPepper)),
            issuedAt: $now,
            expiresAt: $hardExpiry,
            lastSeenAt: null,
            revokedAt: null,
            revokeReason: null,
            impersonatedBy: $staffAccountId,
            purpose: trim($purpose),
        );
    }

    public static function token(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public function isImpersonation(): bool
    {
        return $this->impersonatedBy !== null;
    }

    public function isUsableAt(\DateTimeImmutable $now): bool
    {
        return $this->revokedAt === null && $now < $this->expiresAt;
    }

    /**
     * Touch the last-seen clock, throttled to one write per minute: a busy
     * session must not turn every authenticate into a row update, and the
     * minute-resolution answer is all the fraud review reads anyway.
     */
    public function touch(\DateTimeImmutable $now): bool
    {
        if ($this->lastSeenAt !== null
            && $now->getTimestamp() - $this->lastSeenAt->getTimestamp() < 60) {
            return false;
        }
        $this->lastSeenAt = $now;

        return true;
    }

    public function revoke(string $reason, \DateTimeImmutable $now): void
    {
        if ($this->revokedAt !== null) {
            return;
        }
        $this->revokedAt = $now;
        $this->revokeReason = $reason;
    }

    /**
     * Erasure: the session's device naming and the keyed remote-address hash
     * go NULL, the row is revoked if live. token_hash and the id links stay —
     * they are already digests and the revocation trail is evidence of who was
     * signed in when. The IP hash is keyed but still personal data: a keyed
     * HMAC of one address is re-identifiable with the key, so erasure destroys
     * it rather than keeping it because it "looks like a hash".
     */
    public function anonymise(\DateTimeImmutable $now): void
    {
        $this->deviceLabel = null;
        $this->remoteIpHash = null;
        $this->revoke('subject erased', $now);
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'account_id' => $this->accountId,
            'token_hash' => $this->tokenHash,
            'device_label' => $this->deviceLabel,
            'remote_ip_hash' => $this->remoteIpHash,
            'issued_at' => $this->issuedAt->format(\DateTimeInterface::ATOM),
            'expires_at' => $this->expiresAt->format(\DateTimeInterface::ATOM),
            'last_seen_at' => $this->lastSeenAt?->format(\DateTimeInterface::ATOM),
            'revoked_at' => $this->revokedAt?->format(\DateTimeInterface::ATOM),
            'revoke_reason' => $this->revokeReason,
            'impersonated_by' => $this->impersonatedBy,
            'purpose' => $this->purpose,
        ];
    }

    private static function assertPepper(string $pepper): string
    {
        if (strlen($pepper) < 32) {
            throw new \InvalidArgumentException('IP pepper must be at least 32 chars');
        }

        return $pepper;
    }
}
