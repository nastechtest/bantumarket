<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Persistence\Store;

/**
 * OTP challenges by claim-key hash and by (account, scope).
 *
 * pendingFor() exists for reissue: a second RequestOtp for the same account
 * and scope consumes the previous live challenge as it goes, so at most one
 * redeemable code is ever in flight per pair — two live codes is the state
 * where "the old one still works" becomes a support ticket and a window.
 */
final class OtpChallengeStore
{
    public const TABLE = 'otp_challenges';

    public function __construct(private readonly Store $store)
    {
    }

    public function save(OtpChallenge $challenge): void
    {
        $row = $challenge->toArray();
        $existing = $this->store->find(self::TABLE, $challenge->id);
        if ($existing === null) {
            $this->store->insert(self::TABLE, $row);

            return;
        }
        $this->store->update(self::TABLE, $row);
    }

    /** The live challenge for a bearer claim key, or null. */
    public function findActive(string $claimKeyHash): ?OtpChallenge
    {
        foreach ($this->store->all(self::TABLE) as $row) {
            if ($row['active_claim_key'] !== null
                && (string) $row['active_claim_key'] === $claimKeyHash) {
                return OtpChallenge::fromRow($row);
            }
        }

        return null;
    }

    public function pendingFor(string $accountId, string $scope): ?OtpChallenge
    {
        $best = null;
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['account_id'] !== $accountId || (string) $row['scope'] !== $scope) {
                continue;
            }
            if ($row['consumed_at'] !== null || $row['active_claim_key'] === null) {
                continue;
            }
            $challenge = OtpChallenge::fromRow($row);
            if ($best === null || $challenge->issuedAt > $best->issuedAt) {
                $best = $challenge;
            }
        }

        return $best;
    }
}
