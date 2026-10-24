<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Store a seller-tier grant that another module decided.
 *
 * Identity never computes a tier. The grantor is the authenticated staff
 * account and is written into the row, so a stored tier always has a name and
 * a time behind it; a tier without either is the row the migration refuses and
 * the aggregate refuses earlier with a readable sentence.
 *
 * A tier changes what the seller's account can be trusted to do on the
 * platform, so it is a privilege change and rotates sessions exactly like a
 * role change does.
 */
final class RecordTierGrant
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

    public function handle(string $actorAccountId, string $targetAccountId, SellerTier $tier): Account
    {
        $this->authorisation->require($actorAccountId, Capability::TIER_GRANT);

        $now = $this->clock->now();
        $this->uow->begin();

        try {
            $target = $this->accounts->require($targetAccountId);
            $target->recordTierGrant($tier, $actorAccountId, $now);
            $this->accounts->save($target);

            $revoked = $this->sessions->revokeAllForAccount($targetAccountId, 'tier.change');

            $this->outbox->publish('Account', $targetAccountId, 'TierGranted', [
                'account_id' => $targetAccountId,
                'granted_by' => $actorAccountId,
                'tier' => $tier->value,
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
