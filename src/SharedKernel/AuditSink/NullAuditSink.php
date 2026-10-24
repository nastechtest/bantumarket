<?php

declare(strict_types=1);

namespace NasTech\SharedKernel\AuditSink;

/**
 * The sink that records nothing, used where an audit log is genuinely absent
 * (a unit test of a pricing rule, a CLI that only reads). It is explicit rather
 * than a nullable dependency so a production wiring mistake is visible in the
 * Kernel rather than as an audit log that is silently empty.
 */
final class NullAuditSink implements AuditSink
{
    public function write(AuditRecord $record): void
    {
    }

    public function writeAttempt(AuditRecord $record): void
    {
    }
}
