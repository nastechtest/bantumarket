<?php

declare(strict_types=1);

namespace NasTech\Payouts;

/**
 * The one fact Payouts needs from the dispute side: is this order's money under
 * an open case?
 *
 * It is an interface in this module rather than an import of Orders or
 * Disputes, because the module graph gives Payouts exactly two edges —
 * Settlements and Identity — and "pay only what nobody is arguing about" must
 * not become a third. The composition root supplies the adapter; a test
 * supplies a set of ids. Payouts asks the question at prepare and refuses with
 * a named reason instead of quietly paying a shorter amount.
 *
 * An adapter that answers "false" because it does not know is a real risk, and
 * it is named here rather than hidden: the production adapter must read the
 * case table, not a cache of last week's disputes.
 */
interface OrderDisputes
{
    public function isInDispute(string $orderId): bool;
}
