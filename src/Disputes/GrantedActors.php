<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * An explicit grant table, and nothing else.
 *
 * The composition root builds this from Identity's permission source (or from a
 * test fixture). There is no wildcard, no role expansion and no default: an
 * account not named in $grants holds nothing. That is what fail-closed means in
 * practice, and it is why `has()` checks the capability is one this module
 * knows before it checks the grant — a typo in a grant list must not become a
 * permission that silently never matches, or one that silently does.
 */
final class GrantedActors implements ActorAuthority
{
    /** @var array<string, array<string, true>> */
    private array $grants = [];

    /**
     * @param array<string, list<string>> $grants account id => capability list
     */
    public function __construct(array $grants = [])
    {
        foreach ($grants as $accountId => $capabilities) {
            foreach ($capabilities as $capability) {
                $this->grant((string) $accountId, $capability);
            }
        }
    }

    public function grant(string $accountId, string $capability): void
    {
        DisputeCapability::assertKnown($capability);
        $this->grants[$accountId][$capability] = true;
    }

    public function has(string $accountId, string $capability): bool
    {
        if ($accountId === '' || !in_array($capability, DisputeCapability::ALL, true)) {
            return false;
        }

        return isset($this->grants[$accountId][$capability]);
    }

    public function require(string $accountId, string $capability): void
    {
        if (!$this->has($accountId, $capability)) {
            throw new DisputeAccessDenied(
                'This action is not permitted for this account. The capability is checked server-side, '
                . 'and a missing grant is refused rather than assumed.'
            );
        }
    }
}
