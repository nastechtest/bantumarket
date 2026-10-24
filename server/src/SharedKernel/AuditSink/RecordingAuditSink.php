<?php

declare(strict_types=1);

namespace NasTech\SharedKernel\AuditSink;

/**
 * An in-memory sink for tests: proves a module emitted the audit row it claims
 * to, including the attempt row written after a failed mutation.
 */
final class RecordingAuditSink implements AuditSink
{
    /** @var list<AuditRecord> */
    private array $written = [];

    /** @var list<AuditRecord> */
    private array $attempts = [];

    public function write(AuditRecord $record): void
    {
        $this->written[] = $record;
    }

    public function writeAttempt(AuditRecord $record): void
    {
        $this->attempts[] = $record;
    }

    /**
     * @return list<AuditRecord>
     */
    public function written(): array
    {
        return $this->written;
    }

    /**
     * @return list<AuditRecord>
     */
    public function attempts(): array
    {
        return $this->attempts;
    }
}
