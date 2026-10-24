<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The SQL account repository for a real cluster.
 *
 * There is no PDO driver in this environment, so this class renders the
 * statements and binds the parameters against a two-closure executor the
 * composition root supplies when one exists: `query` (sql, params) => rows and
 * `execute` (sql, params) => affected count. That is the same arrangement the
 * README already makes for pdo_* "as an interface": the SQL is reviewable,
 * executable text today, and the only thing the deploy adds is the driver.
 *
 * Why the CAS predicate is visible here and tested by string: `WHERE id = :id
 * AND version = :expected` is the whole optimistic lock — an UPDATE that
 * matched zero rows either means "no such account" or "lost the race", and
 * the follow-up SELECT tells them apart. A repository that read-modify-wrote
 * without the version in the WHERE would quietly resurrect pre-erasure values
 * over an anonymised row; the migration's monotonic-version trigger is the
 * backstop for sessions that skip this repository entirely.
 */
final class SqlAccountRepository implements AccountRepository
{
    /** @var \Closure(string, array<string,mixed>): list<array<string,mixed>> */
    private \Closure $query;

    /** @var \Closure(string, array<string,mixed>): int */
    private \Closure $execute;

    /**
     * @param \Closure(string, array<string,mixed>): list<array<string,mixed>> $query
     * @param \Closure(string, array<string,mixed>): int $execute
     */
    public function __construct(\Closure $query, \Closure $execute)
    {
        $this->query = $query;
        $this->execute = $execute;
    }

    public function save(Account $account): void
    {
        $row = $account->toArray();

        // The update is attempted for every save; on zero affected rows we
        // find out which of "never existed" or "stale" it was. Re-reads are
        // cheaper than a client-side cache of existence that can be wrong.
        $affected = ($this->execute)(
            'UPDATE identity.accounts SET
                phone_e164 = :phone_e164, display_name = :display_name, role = :role,
                status = :status, tier = :tier, tier_granted_by = :tier_granted_by,
                tier_granted_at = :tier_granted_at, password_set_at = :password_set_at,
                version = :version, erased_at = :erased_at
             WHERE id = :id AND version = :expected',
            [
                'phone_e164' => $row['phone_e164'],
                'display_name' => $row['display_name'],
                'role' => $row['role'],
                'status' => $row['status'],
                'tier' => $row['tier'],
                'tier_granted_by' => $row['tier_granted_by'],
                'tier_granted_at' => $row['tier_granted_at'],
                'password_set_at' => $row['password_set_at'],
                'version' => $account->version,
                'erased_at' => $row['erased_at'],
                'id' => $account->id,
                'expected' => $account->loadedVersion(),
            ],
        );

        if ($affected === 1) {
            return;
        }

        $found = ($this->query)('SELECT version FROM identity.accounts WHERE id = :id', ['id' => $account->id]);
        if ($found === []) {
            ($this->execute)(
                'INSERT INTO identity.accounts
                    (id, phone_e164, display_name, role, status, tier, tier_granted_by,
                     tier_granted_at, password_set_at, version, created_at, erased_at)
                 VALUES
                    (:id, :phone_e164, :display_name, :role, :status, :tier, :tier_granted_by,
                     :tier_granted_at, :password_set_at, 1, :created_at, :erased_at)',
                [
                    'id' => $account->id,
                    'phone_e164' => $row['phone_e164'],
                    'display_name' => $row['display_name'],
                    'role' => $row['role'],
                    'status' => $row['status'],
                    'tier' => $row['tier'],
                    'tier_granted_by' => $row['tier_granted_by'],
                    'tier_granted_at' => $row['tier_granted_at'],
                    'password_set_at' => $row['password_set_at'],
                    'created_at' => $row['created_at'],
                    'erased_at' => $row['erased_at'],
                ],
            );

            return;
        }

        throw new StaleAccountVersion(sprintf(
            'Account %s was loaded at version %d but the row now holds %d; refusing to overwrite',
            $account->id,
            $account->loadedVersion(),
            (int) $found[0]['version'],
        ));
    }

    public function find(string $id): ?Account
    {
        $rows = ($this->query)('SELECT * FROM identity.accounts WHERE id = :id', ['id' => $id]);

        return $rows === [] ? null : Account::fromRow($rows[0]);
    }

    public function findByPhone(string $e164): ?Account
    {
        $rows = ($this->query)(
            'SELECT * FROM identity.accounts WHERE phone_e164 = :phone',
            ['phone' => $e164],
        );

        return $rows === [] ? null : Account::fromRow($rows[0]);
    }

    public function require(string $id): Account
    {
        $account = $this->find($id);
        if ($account === null) {
            throw new \RuntimeException("Unknown account: {$id}");
        }

        return $account;
    }
}
