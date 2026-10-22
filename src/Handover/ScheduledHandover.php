<?php

declare(strict_types=1);

namespace NasTech\Handover;

/**
 * The only moment the handover PIN exists in plaintext: the token as stored, and
 * the code as delivered to the two parties. It is returned once by the issuing
 * command and never readable again afterwards.
 */
final class ScheduledHandover
{
    public function __construct(
        public readonly HandoverToken $token,
        public readonly string $pin,
    ) {
    }
}
