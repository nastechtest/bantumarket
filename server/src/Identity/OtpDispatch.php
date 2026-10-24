<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The one and only time an OTP exists in plaintext: the dispatch returned to
 * whoever sends the SMS. Storage holds the HMAC digest and the claim-key
 * digest; neither the code nor the claim key is ever written, logged or put in
 * an outbox payload.
 */
final class OtpDispatch
{
    public function __construct(
        public readonly string $challengeId,
        public readonly string $scope,
        public readonly ?string $channelId,
        public readonly string $claimKey,
        public readonly string $code,
        public readonly \DateTimeImmutable $expiresAt,
    ) {
    }
}
