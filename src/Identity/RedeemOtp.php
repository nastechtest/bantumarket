<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Redeem a one-time code with its claim key.
 *
 * The comparison is hash_equals() against the stored digest, never `===`:
 * a short string comparison that returns early on the first differing byte is
 * a countdown oracle over 10^6 codes, and unlike a password the code is
 * short-lived but high-volume guessable.
 *
 * Indistinguishability is the other half. An unknown claim key, an expired
 * challenge, a challenge at its attempt ceiling and a wrong code all do the
 * same constant-time comparison and throw the identical AuthFailed::invalidOtp().
 * The attempt counter is persisted for real challenges, but the caller never
 * learns it, because "three attempts left" also answers "this challenge is
 * real".
 */
final class RedeemOtp
{
    /** @var non-empty-string a fixed decoy digest, computed once from the pepper */
    private readonly string $decoyDigest;

    private int $comparisons = 0;

    public function __construct(
        private readonly AccountRepository $accounts,
        private readonly OtpChallengeStore $challenges,
        private readonly ContactChannelStore $channels,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
        private readonly string $pepper,
    ) {
        if (strlen($pepper) < 32) {
            throw new \InvalidArgumentException('OTP pepper must be at least 32 chars');
        }
        $this->decoyDigest = OtpChallenge::derive('decoy', '000000', $pepper);
    }

    public function handle(string $claimKey, string $code): OtpRedemption
    {
        $now = $this->clock->now();
        $claimKeyHash = OtpChallenge::claimKeyHash($claimKey, $this->pepper);
        $challenge = $this->challenges->findActive($claimKeyHash);

        // Exactly one constant-time comparison on every path, using the real
        // digest when there is a real challenge and the decoy when there is
        // not. The work does not answer "does this claim key exist".
        $digest = $challenge?->digest ?? $this->decoyDigest;
        $challengeId = $challenge?->id ?? 'decoy';
        $matches = hash_equals($digest, OtpChallenge::derive($challengeId, $code, $this->pepper));
        $this->comparisons++;

        if ($challenge === null) {
            throw AuthFailed::invalidOtp();
        }

        if (!$matches) {
            $this->burnAttempt($challenge, $now);

            throw AuthFailed::invalidOtp();
        }

        if (!$challenge->isRedeemableAt($now)) {
            // A correct code on an expired or locked challenge still ends in
            // the same sentence. Nothing about why is returned.
            throw AuthFailed::invalidOtp();
        }

        $this->uow->begin();
        try {
            $challenge->consume($now);
            $this->challenges->save($challenge);

            if ($challenge->scope === OtpChallenge::SCOPE_CHANNEL_PROVEN) {
                $channel = $this->channels->require((string) $challenge->channelId);
                if ($channel->accountId !== $challenge->accountId) {
                    throw new AccessDenied('A channel can only be proven by the account that owns it');
                }
                $channel->prove($now);
                $this->channels->save($channel);
            }

            $this->outbox->publish('Account', $challenge->accountId, 'OtpRedeemed', [
                'account_id' => $challenge->accountId,
                'challenge_id' => $challenge->id,
                'scope' => $challenge->scope,
                'channel_id' => $challenge->channelId,
                'redeemed_at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return new OtpRedemption(
                challengeId: $challenge->id,
                accountId: $challenge->accountId,
                scope: $challenge->scope,
                channelId: $challenge->channelId,
                redeemedAt: $now,
            );
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    /**
     * Test seam: how many constant-time comparisons this command has made.
     * The indistinguishability test asserts the unknown-claim-key and
     * wrong-code paths do the same work, which a wall-clock assertion could
     * never prove reliably.
     */
    public function comparisons(): int
    {
        return $this->comparisons;
    }

    private function burnAttempt(OtpChallenge $challenge, \DateTimeImmutable $now): void
    {
        if ($challenge->attempts >= OtpChallenge::MAX_ATTEMPTS) {
            return;
        }

        $this->uow->begin();
        try {
            $challenge->recordFailure();
            $this->challenges->save($challenge);

            $locked = $challenge->attempts >= OtpChallenge::MAX_ATTEMPTS;
            $this->outbox->publish('Account', $challenge->accountId, $locked ? 'OtpChallengeLocked' : 'OtpRejected', [
                'account_id' => $challenge->accountId,
                'challenge_id' => $challenge->id,
                'attempts' => $challenge->attempts,
            ]);

            $this->uow->commit();
        } catch (\Throwable) {
            // The challenge moved under us or hit its ceiling. The caller still
            // gets the uniform rejection; a different exception would be the
            // leak this whole class is built to avoid.
            $this->uow->rollback();
        }
    }
}
