<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * The driver port SqlMessagingRepository speaks through.
 *
 * In production this is a few lines over PDO. Here there is no driver, so the only
 * implementation is the recording one under tests/Messaging, which asserts the
 * statements rather than running them. That gap is stated in the README rather
 * than papered over: `psql -v ON_ERROR_STOP=1` remains a deploy gate.
 */
interface SqlExecutor
{
    /**
     * @return list<array<string,mixed>>
     */
    public function execute(SqlStatement $statement): array;
}
