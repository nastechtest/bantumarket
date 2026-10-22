<?php

declare(strict_types=1);

namespace NasTech\Settlements;

/**
 * What the settlement file said and what the ledger said, side by side.
 *
 * The file is not authoritative and neither is a human eyeballing it. The rule is
 * that a difference is an item on a list until it is closed, never an automatic
 * adjustment — an automatic adjustment is how a provider's bad row silently
 * becomes the platform's bad ledger.
 */
final class ReconciliationReport
{
    /** @param list<array{order_id:string, observed:string, expected:string, kind:string}> $discrepancies */
    public function __construct(
        public readonly array $discrepancies,
        public readonly int $linesChecked,
        public readonly int $ledgerOrdersChecked,
    ) {
    }

    public function isClean(): bool
    {
        return $this->discrepancies === [];
    }

    /** @return list<string> */
    public function summaryLines(): array
    {
        return array_map(
            static fn (array $d): string => sprintf('%s — %s: ledger %s, file %s',
                $d['kind'], $d['order_id'], $d['expected'], $d['observed']),
            $this->discrepancies,
        );
    }
}
