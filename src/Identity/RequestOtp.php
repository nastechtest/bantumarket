<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Issue a six-digit one-time code for one account and one scope.
 *
 * The code never enters storage, the outbox or a log: the store keeps an HMAC
 * digest salted with the challenge id, and the claim key — a separate 256-bit
 * bearer secret — is kept as its own digest. Two live codes for one account
 * and scope are impossible by construction: a new request supersedes the old
 * challenge in the same transaction, and the unique index on the live claim
 * key is the race guard.
 */
final class RequestOtp
{
    public const CODE_LIFETIME = 'PT10M';

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
    }

    public function handle(string $accountId, string $scope, ?string $channelId = null): OtpDispatch
    {
        if (!in_array($scope, OtpChallenge::SCOPES, true)) {
            throw new \InvalidArgumentException("Unknown OTP scope: {$scope}");
        }

        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $account = $this->accounts->require($accountId);
            if (!$account->isActive()) {
                throw new \DomainException('Only an active account can receive a one-time code');
            }
            if ($scope === OtpChallenge::SCOPE_CHANNEL_PROVEN) {
                if ($channelId === null) {
                    throw new \InvalidArgumentException('A channel.proven challenge names the channel it will prove');
                }
                $channel = $this->channels->require($channelId);
                if ($channel->accountId !== $accountId) {
                    throw new AccessDenied('A channel can only be proven by the account that owns it');
                }
                if ($channel->isAnonymised()) {
                    throw new \DomainException('An erased channel has no address left to prove');
                }
            }

            $previous = $this->challenges->pendingFor($accountId, $scope);
            if ($previous !== null) {
                $previous->supersede($now);
                $this->challenges->save($previous);
            }

            $code = sprintf('%06d', random_int(0, 999999));
            $claimKey = Session::token();
            $challenge = OtpChallenge::issue(
                id: Id::generate('otp')->value(),
                accountId: $accountId,
                scope: $scope,
                channelId: $channelId,
                code: $code,
                claimKeyPlaintext: $claimKey,
                pepper: $this->pepper,
                issuedAt: $now,
                window: new \DateInterval(self::CODE_LIFETIME),
            );
            $this->challenges->save($challenge);

            $this->outbox->publish('Account', $accountId, 'OtpRequested', [
                'account_id' => $accountId,
                'challenge_id' => $challenge->id,
                'scope' => $scope,
                'channel_id' => $channelId,
                'expires_at' => $challenge->expiresAt->format(\DateTimeInterface::ATOM),
                // No code, no claim key: the outbox is not a delivery channel
                // for a secret. The SMS adapter receives the dispatch directly.
            ]);

            $this->uow->commit();

            return new OtpDispatch(
                challengeId: $challenge->id,
                scope: $scope,
                channelId: $channelId,
                claimKey: $claimKey,
                code: $code,
                expiresAt: $challenge->expiresAt,
            );
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
