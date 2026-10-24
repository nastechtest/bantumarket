<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * One SQL statement and its bound parameters.
 *
 * A value rather than a call, so the statements Media emits are assertable as data:
 * tests/Media/SqlMediaRepositoryTest.php compares them column-for-column against
 * db/migrations/003_media.sql, which is the only way to check the SQL in an
 * environment with no PDO driver and no server.
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
