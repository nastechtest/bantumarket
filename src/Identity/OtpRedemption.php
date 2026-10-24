<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * What a redeemed OTP proves: this account, at this scope, at this instant.
 *
 * It is returned only by RedeemOtp, after the challenge was consumed inside a
 * committed transaction. It carries no code, no claim key and no attempt
 * count — a caller holding one has already proved possession of the channel,
 * and nothing else about the challenge is their business.
 */
final class OtpRedemption
{
    public function __construct(
        public readonly string $challengeId,
        public readonly string $accountId,
        public readonly string $scope,
        public readonly ?string $channelId,
        public readonly \DateTimeImmutable $redeemedAt,
    ) {
    }
}
