<?php

declare(strict_types=1);

namespace NasTech\Settlements;

use NasTech\SharedKernel\Money;

/**
 * One row of the provider's settlement file, already parsed.
 */
final class SettlementLine
{
    public function __construct(
        public readonly string $orderId,
        public readonly Money $gross,
        public readonly Money $platformTake,
        public readonly Money $netToSeller,
    ) {
        if ($orderId === '') {
            throw new \InvalidArgumentException('Settlement line carries no order reference');
        }
        $expected = $gross->subtract($platformTake);
        if (!$expected->equals($netToSeller)) {
            throw new \InvalidArgumentException(sprintf(
                'Settlement line for %s does not add up: %s gross less %s take is not %s',
                $orderId,
                $gross->toRandString(),
                $platformTake->toRandString(),
                $netToSeller->toRandString(),
            ));
        }
    }
}
