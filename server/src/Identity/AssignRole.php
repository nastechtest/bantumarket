<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Change an account's role, which changes what it may do.
 *
 * A privilege change rotates every live session for the target: the old
 * session carries capabilities derived from the old role, and a stolen token
 * that survives a promotion — or a demotion — is the privilege escalation this
 * module exists to refuse. The caller is authorised server-side through the
 * capability map; the role string is data, not an assertion about a person.
 */
final class AssignRole
{
    public function __construct(
        private readonly AccountRepository $accounts,
        private readonly Authorisation $authorisation,
        private readonly SessionRegistry $sessions,
        private readonly UnitOfWork $uow,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(string $actorAccountId, string $targetAccountId, string $role): Account
    {
        $this->authorisation->require($actorAccountId, Capability::ROLE_ASSIGN);

        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $target = $this->accounts->require($targetAccountId);
            $previous = $target->role;
            $target->assignRole($role);
            $this->accounts->save($target);

            $revoked = $this->sessions->revokeAllForAccount($targetAccountId, 'role.change');

            $this->outbox->publish('Account', $targetAccountId, 'RoleAssigned', [
                'account_id' => $targetAccountId,
                'actor_account_id' => $actorAccountId,
                'previous_role' => $previous,
                'role' => $target->role,
                'sessions_revoked' => $revoked,
                'at' => $now->format(\DateTimeInterface::ATOM),
            ]);

            $this->uow->commit();

            return $target;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }
}
