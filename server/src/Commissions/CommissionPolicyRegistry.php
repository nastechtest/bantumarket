<?php

declare(strict_types=1);

namespace NasTech\Commissions;

/**
 * Policy resolution by category and instant.
 *
 * The ledger stores the rate that produced each entry, so a policy change never
 * re-prices history. This class is what makes the *forward* case deterministic:
 * the same category at the same instant always resolves to the same policy, and
 * an ambiguous or missing window is an error rather than a default.
 */
final class CommissionPolicyRegistry
{
    /** @var list<CommissionPolicy> */
    private array $policies = [];

    /**
     * @param list<CommissionPolicy> $policies
     */
    public function __construct(array $policies = [])
    {
        foreach ($policies as $policy) {
            $this->add($policy);
        }
    }

    public function add(CommissionPolicy $policy): void
    {
        foreach ($this->policies as $existing) {
            if ($existing->category !== $policy->category) {
                continue;
            }
            if ($policy->effectiveFrom < $existing->effectiveTo && $existing->effectiveFrom < $policy->effectiveTo) {
                throw new \DomainException(sprintf(
                    'Overlapping commission policies for category "%s": %s (%s–%s) and %s (%s–%s). '
                    . 'Two live rates for one category means nobody can say what a sale cost.',
                    $policy->category,
                    $existing->id,
                    $existing->effectiveFrom->format('Y-m-d'),
                    $existing->effectiveTo->format('Y-m-d'),
                    $policy->id,
                    $policy->effectiveFrom->format('Y-m-d'),
                    $policy->effectiveTo->format('Y-m-d'),
                ));
            }
        }

        $this->policies[] = $policy;
    }

    public function resolve(string $category, \DateTimeImmutable $at): CommissionPolicy
    {
        foreach ($this->policies as $policy) {
            if ($policy->category === $category && $policy->appliesTo($at)) {
                return $policy;
            }
        }

        $windows = array_values(array_map(
            static fn (CommissionPolicy $p): string => sprintf(
                '%s: %s–%s',
                $p->id,
                $p->effectiveFrom->format('Y-m-d'),
                $p->effectiveTo->format('Y-m-d'),
            ),
            array_filter($this->policies, static fn (CommissionPolicy $p): bool => $p->category === $category),
        ));

        throw new NoCommissionPolicy(sprintf(
            'No commission policy covers category "%s" at %s. Known windows: %s',
            $category,
            $at->format('Y-m-d H:i:s'),
            $windows === [] ? '(none declared)' : implode(', ', $windows),
        ));
    }

    public function has(string $category): bool
    {
        foreach ($this->policies as $policy) {
            if ($policy->category === $category) {
                return true;
            }
        }

        return false;
    }
}
