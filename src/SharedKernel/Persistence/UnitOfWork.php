<?php

declare(strict_types=1);

namespace NasTech\SharedKernel\Persistence;

interface UnitOfWork
{
    public function begin(): void;

    public function commit(): void;

    public function rollback(): void;

    public function inTransaction(): bool;

    /**
     * Register an invariant that must hold at commit time.
     *
     * @param callable():void $guard
     */
    public function addCommitGuard(string $name, callable $guard): void;

    /**
     * Install an invariant that every transaction is checked against, whether or
     * not the handler knows about it.
     *
     * This is the difference between a guard a handler must remember to register
     * and a property of the storage layer. A commit-time guard written in the
     * handler can only detect that the handler forgot something it also does
     * itself; a global invariant can detect the omission at all.
     *
     * @param callable():void $checker
     */
    public function setInvariantChecker(callable $checker): void;

    /**
     * Register work that runs only after a successful commit — outbox dispatch,
     * search indexing, notifications. Never inside the transaction.
     *
     * @param callable():void $hook
     */
    public function afterCommit(string $name, callable $hook): void;
}
