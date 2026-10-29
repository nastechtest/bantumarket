<?php

declare(strict_types=1);

namespace NasTech\Audit;

/**
 * The audit store refused a record.
 *
 * This is a domain refusal, not a persistence error: a secret in the payload, a
 * staff action with no capability, an unknown actor kind or a write attempted
 * outside the action's transaction. The caller's transaction rolls back, so the
 * action the record described is refused rather than written unlogged.
 */
final class AuditRefused extends \DomainException
{
}
