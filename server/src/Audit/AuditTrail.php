<?php

declare(strict_types=1);

namespace NasTech\Audit;

use NasTech\SharedKernel\AuditSink\AuditRecord;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * The API that makes "log later" impossible to express.
 *
 * A caller hands over the record and the work together. The trail opens the
 * transaction, writes the record first, runs the work, and commits both. There is
 * no method that takes only a record and no method that runs work without one:
 * a module that wants to act must decide what will be written about it before it
 * acts, and a log write that fails means the action never runs.
 *
 * The work callable must use repositories bound to the same Store as the
 * UnitOfWork. It does not receive the transaction because it should not be able
 * to commit independently of the record.
 */
final class AuditTrail
{
    public function __construct(
        private readonly AuditLog $log,
        private readonly UnitOfWork $uow,
    ) {
    }

    /**
     * Run $work and write $record in the same transaction.
     *
     * The record is written first. If the record is refused or storage rejects it,
     * $work is never called and the transaction rolls back. If $work fails, the
     * record is rolled back with it — there is no audit row for an action that did
     * not happen.
     *
     * @template T
     * @param callable():T $work
     * @return T
     */
    public function record(AuditRecord $record, callable $work): mixed
    {
        $this->uow->begin();

        try {
            $this->log->write($record);
            $result = $work();
            $this->uow->commit();

            return $result;
        } catch (\Throwable $failure) {
            $this->uow->rollback();
            throw $failure;
        }
    }

    /**
     * Run $work; if it is refused, write the attempt row after the rollback.
     *
     * This is the one deliberate exception to "the record commits with the work":
     * the attempt describes an action that must NOT have happened. It is written
     * only after the domain transaction is rolled back, so it survives the refusal
     * it explains, and it still passes the same secret and actor rules.
     *
     * @template T
     * @param callable():T $work
     * @return T
     */
    public function attempt(AuditRecord $attempt, callable $work): mixed
    {
        $this->uow->begin();

        try {
            $result = $work();
            $this->uow->commit();

            return $result;
        } catch (\Throwable $failure) {
            $this->uow->rollback();

            try {
                $this->log->writeAttempt($attempt);
            } catch (\Throwable $auditFailure) {
                throw $auditFailure;
            }

            throw $failure;
        }
    }
}
