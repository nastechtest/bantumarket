<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The account persistence port — the interface the rest of the product names.
 *
 * Two implementations, exactly one seam each:
 *   InMemoryAccountRepository  — SharedKernel Store (the model the tests run;
 *                                enforces the phone unique index and the CAS
 *                                version check the same way the DDL does);
 *   SqlAccountRepository       — renders the real SQL for production, CAS
 *                                predicate included, against a closure the
 *                                composition root binds to pdo_pgsql later.
 *
 * There is deliberately no `findAll()` and no criteria search: a module whose
 * every other module depends on does not hand out enumeration endpoints. Read
 * paths by id or by normalised phone; anything richer is a projection owned
 * by whoever needs it, not a hole in this aggregate's boundary.
 */
interface AccountRepository
{
    public function save(Account $account): void;

    public function find(string $id): ?Account;

    /**
     * The login-lookup path. Takes the E.164 form already — normalisation is
     * the caller's job (PhoneNumber), because a lookup by an unnormalised
     * string is how one person gets two accounts.
     */
    public function findByPhone(string $e164): ?Account;

    /**
     * @throws \RuntimeException when the account does not exist — internal
     *         command paths use this; attacker-facing endpoints must resolve
     *         to a uniform AuthFailed before reaching it.
     */
    public function require(string $id): Account;
}
