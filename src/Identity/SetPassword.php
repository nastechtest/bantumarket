<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Id;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Set or replace the password credential.
 *
 * "Password set" and "channel proven" are two different facts with two
 * different failure modes, and `Account::markPasswordSet` is deliberately the
 * only flag this touches: proving an SMS does not prove a secret, and choosing
 * a secret does not prove the SIM.
 *
 * A replacement is a *reset*: every live session for the account is revoked in
 * the same transaction, so a token stolen before the reset dies with it. That
 * rotation is the stolen-token test.
 */
final class SetPassword
{
    public const MIN_LENGTH = 12;

    public function __construct(
        private readonly AccountRepository $accounts,
        private readonly CredentialStore $credentials,
        private readonly PasswordHasher $hasher,
        private readonly SessionRegistry $sessions,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    /**
     * @return bool true when an existing secret was replaced (a reset), false
     *              when this was the first password
     */
    public function handle(string $accountId, string $password): bool
    {
        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $account = $this->accounts->require($accountId);
            if (!$account->isActive()) {
                throw new AuthFailed('This account cannot set a password.');
            }
            self::assertAcceptable($password, $account);

            $existing = $this->credentials->forAccount($accountId);
            $reset = $existing !== null;

            if ($existing === null) {
                $credential = Credential::create(Id::generate('crd')->value(), $accountId, $this->hasher, $password, $now);
            } else {
                $credential = $existing;
                $credential->replaceSecret($this->hasher, $password, $now);
            }
            $this->credentials->save($credential);

            $account->markPasswordSet($now);
            $this->accounts->save($account);

            $revoked = $reset ? $this->sessions->revokeAllForAccount($accountId, 'password.reset') : 0;

            $this->outbox->publish('Account', $accountId, $reset ? 'PasswordReset' : 'PasswordSet', [
                'account_id' => $accountId,
                'sessions_revoked' => $revoked,
                'at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return $reset;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    /**
     * A password is a secret a person chooses, not a formality. The floor and
     * the "not the phone number" rule are the two failures a phone-first
     * product actually has: short PINs typed into a password field, and the
     * account's own number reused as the password.
     */
    public static function assertAcceptable(string $password, Account $account): void
    {
        if (strlen($password) < self::MIN_LENGTH) {
            throw new \InvalidArgumentException(sprintf(
                'A password is at least %d characters; a shorter secret is a PIN by another name',
                self::MIN_LENGTH,
            ));
        }

        $digits = preg_replace('/\D+/', '', $account->phoneE164) ?? '';
        if ($digits !== '' && trim($password) === $digits) {
            throw new \InvalidArgumentException('The account phone number is not a password');
        }
    }
}
