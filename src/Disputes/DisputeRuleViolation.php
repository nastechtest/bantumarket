<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * A dispute rule refused a write. The module's general refusal: legal-shaped input that
 * the domain will not accept, for a reason stated in the message.
 *
 * It is a `DomainException` rather than a runtime failure because nothing about the
 * storage was wrong — the request was. The HTTP edge maps it to a 4xx with the message
 * shown to the party, so the sentence is user-facing copy in the same way
 * `HandoverRejected`'s is: it must name the rule, never a transfer reference or an
 * internal identifier.
 */
class DisputeRuleViolation extends \DomainException
{
}
