<?php

declare(strict_types=1);

namespace NasTech\Audit;

/**
 * Who acted, in the vocabulary the audit console and the DDL share.
 *
 * The SharedKernel AuditRecord names an actor by role because a module already
 * knows whether the caller is a buyer, a seller or staff. The audit store turns
 * that role into a closed kind so a typo cannot create a fifth category in
 * production, and so `staff` is the one kind that must also name the capability
 * it used and (when impersonating) the account it acted as.
 */
enum ActorKind: string
{
    case Buyer = 'buyer';
    case Seller = 'seller';
    case Staff = 'staff';
    case System = 'system';

    public static function fromRole(string $role): self
    {
        $normalised = strtolower(trim($role));

        return self::tryFrom($normalised) ?? throw new AuditRefused(sprintf(
            'Unknown audit actor role "%s"; the audit log knows buyer, seller, staff and system',
            $role,
        ));
    }

    public function isStaff(): bool
    {
        return $this === self::Staff;
    }

    public function isSystem(): bool
    {
        return $this === self::System;
    }

    /**
     * The values the DDL's actor_kind CHECK enumerates.
     *
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(
            static fn (self $kind): string => $kind->value,
            self::cases(),
        );
    }
}
