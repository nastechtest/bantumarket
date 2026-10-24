<?php

declare(strict_types=1);

namespace NasTech\SharedKernel\AuditSink;

/**
 * The write-only audit port every module names.
 *
 * Two methods, because they have different transaction semantics and conflating
 * them loses the row that matters:
 *
 *  - write()        joins the caller's unit of work. The audit row commits or rolls
 *                   back with the state change it describes.
 *  - writeAttempt() runs outside it, in its own insert. A stale CAS or a rejected
 *                   sanction has already rolled the domain transaction back; the
 *                   attempt is exactly the thing an auditor asks about, so it must
 *                   survive the rollback. It is deliberately not a second `write`
 *                   call that a caller might forget to make.
 */
interface AuditSink
{
    public function write(AuditRecord $record): void;

    public function writeAttempt(AuditRecord $record): void;
}
