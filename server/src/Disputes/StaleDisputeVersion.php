<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * The case moved under a read that is now old.
 *
 * Exactly the shape `StaleOrderVersion` takes: the caller loaded version N, the store
 * holds something newer, and the write that would silently discard the difference is
 * refused instead. On a dispute this is not a theoretical concern — two resolvers in the
 * staff console open the same case, one commits a partial refund, and the second one's
 * save would otherwise overwrite the first decision's pointer while the decision rows
 * themselves survive. The append-only rows would then belong to a case that does not
 * mention them.
 */
final class StaleDisputeVersion extends \DomainException
{
}
