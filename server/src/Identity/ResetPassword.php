<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Complete a password reset that a redeemed password.reset OTP authorised.
 *
 * The redemption is a proof object: it can only be minted by RedeemOtp, it
 * names the account, and its scope is checked here. A login-scoped code cannot
 * reset a password, and a channel-proven code cannot either — the scope is
 * stored on the challenge and travels with the proof, so the defence is a
 * value rather than a handler's memory.
 *
 * The actual secret replacement is SetPassword, deliberately: setting and
 * resetting a password must share one implementation of the password floor,
 * the digest upgrade and the session rotation, or the reset path eventually
 * drifts from the set path.
 */
final class ResetPassword
{
    public function __construct(private readonly SetPassword $setPassword)
    {
    }

    public function handle(OtpRedemption $redemption, string $newPassword): void
    {
        if ($redemption->scope !== OtpChallenge::SCOPE_PASSWORD_RESET) {
            throw new AccessDenied(sprintf(
                'A "%s" code cannot reset a password; only a password.reset code can',
                $redemption->scope,
            ));
        }

        $this->setPassword->handle($redemption->accountId, $newPassword);
    }
}
