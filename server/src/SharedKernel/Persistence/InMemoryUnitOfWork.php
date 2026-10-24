<?php

declare(strict_types=1);

namespace NasTech\SharedKernel\Persistence;

/**
 * Transaction boundary with commit-time invariant guards.
 *
 * Why guards exist: the red edges in the module graph say an order transition
 * and its LedgerEntry must commit together. A guard is how that becomes a
 * property of the transaction rather than a property of whoever wrote the
 * handler. A handler that forgets to write the ledger does not produce a paid
 * order with no money record; it produces a rollback and an exception.
 *
 * Rollback is a store snapshot restore, because this environment has no PDO
 * driver. Against PostgreSQL the same class issues BEGIN/COMMIT/ROLLBACK and
 * the guards become CHECK constraints or a trigger — the semantics do not
 * change, which is the point of keeping them behind this interface.
 */
final class InMemoryUnitOfWork implements UnitOfWork
{
    private bool $active = false;

    /** @var array<string, array<string, array<string,mixed>>>|null */
    private ?array $snapshot = null;

    /** @var array<string, callable():void> */
    private array $guards = [];

    /** @var array<string, callable():void> */
    private array $hooks = [];

    /** Optional seam to simulate storage failing at the moment of commit. */
    private ?\Throwable $plannedCommitFailure = null;

    /** @var list<string> names of guards that have fired, for assertions */
    private array $guardNamesRun = [];

    /** @var callable():void|null */
    private $invariantChecker = null;

    public function __construct(private readonly Store&InMemoryStore $store)
    {
    }

    public function begin(): void
    {
        if ($this->active) {
            throw new \LogicException('Nested transactions are not supported at launch scale');
        }
        $this->active = true;
        $this->snapshot = $this->store->snapshot();
        $this->guards = [];
        $this->hooks = [];
        $this->guardNamesRun = [];
    }

    public function commit(): void
    {
        if (!$this->active) {
            throw new \LogicException('commit() outside a transaction');
        }

        try {
            if ($this->invariantChecker !== null) {
                // Runs first and unconditionally: this is the layer that catches a
                // handler which never registered any guard of its own.
                ($this->invariantChecker)();
            }

            foreach ($this->guards as $name => $guard) {
                $this->guardNamesRun[] = $name;
                $guard();
            }

            if ($this->plannedCommitFailure !== null) {
                throw $this->plannedCommitFailure;
            }
        } catch (\Throwable $failure) {
            $this->discard();
            throw $failure;
        }

        $this->active = false;
        $this->snapshot = null;
        $completed = $this->hooks;
        $this->guards = [];
        $this->hooks = [];
        $this->plannedCommitFailure = null;

        // Post-commit dispatch: at-least-once, idempotent consumers.
        foreach ($completed as $hook) {
            $hook();
        }
    }

    public function rollback(): void
    {
        if (!$this->active) {
            return;
        }
        $this->discard();
    }

    public function inTransaction(): bool
    {
        return $this->active;
    }

    public function addCommitGuard(string $name, callable $guard): void
    {
        if (!$this->active) {
            throw new \LogicException('addCommitGuard() outside a transaction');
        }
        if (isset($this->guards[$name])) {
            throw new \LogicException("Guard already registered: {$name}");
        }
        $this->guards[$name] = $guard;
    }

    public function setInvariantChecker(callable $checker): void
    {
        $this->invariantChecker = $checker;
    }

    public function afterCommit(string $name, callable $hook): void
    {
        $this->hooks[$name] = $hook;
    }

    /**
     * Test seam: make the next commit fail as though the database had rejected
     * the transaction. Used to prove that no partial money state survives.
     */
    public function failNextCommit(\Throwable $reason): void
    {
        $this->plannedCommitFailure = $reason;
    }

    /**
     * @return list<string>
     */
    public function guardNamesRun(): array
    {
        return $this->guardNamesRun;
    }

    private function discard(): void
    {
        if ($this->snapshot !== null) {
            $this->store->restore($this->snapshot);
        }
        $this->active = false;
        $this->snapshot = null;
        $this->guards = [];
        $this->hooks = [];
        $this->plannedCommitFailure = null;
    }
}
