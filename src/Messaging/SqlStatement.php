<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * One SQL statement and its bound parameters.
 *
 * A value rather than a call: with no PDO driver and no PostgreSQL server in this
 * environment, the only way to review the SQL is to assert it as data. The
 * migration test reads the same column names from 009_messaging.sql.
 */
final class SqlStatement
{
    /**
     * @param list<mixed> $params
     */
    public function __construct(
        public readonly string $sql,
        public readonly array $params = [],
        public readonly bool $returnsRows = false,
    ) {
    }

    /**
     * @param list<mixed> $params
     */
    public static function selecting(string $sql, array $params = []): self
    {
        return new self($sql, $params, true);
    }
}
