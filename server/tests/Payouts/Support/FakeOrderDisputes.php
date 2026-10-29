<?php

declare(strict_types=1);

namespace NasTech\Tests\Payouts\Support;

use NasTech\Payouts\OrderDisputes;

/**
 * The dispute port, as a set of order ids. Payouts may not import Disputes, so
 * the test supplies the answer the composition root's adapter would supply.
 */
final class FakeOrderDisputes implements OrderDisputes
{
    /** @var array<string, true> */
    private array $disputed = [];

    public function dispute(string $orderId): void
    {
        $this->disputed[$orderId] = true;
    }

    public function resolve(string $orderId): void
    {
        unset($this->disputed[$orderId]);
    }

    public function isInDispute(string $orderId): bool
    {
        return isset($this->disputed[$orderId]);
    }
}
