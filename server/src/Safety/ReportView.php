<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * A report as one viewer is allowed to see it.
 *
 * This is the only carrier of a report body across the module boundary. The
 * body is nullable and there is a named visibility for why: "withheld from the
 * reported party" and "withheld because you are neither the reporter nor
 * staff" are different facts, and a null body with no reason would make the
 * distinction invisible to the console and to the test.
 */
final class ReportView
{
    public const VISIBLE_TO_REPORTER = 'REPORTER';
    public const VISIBLE_TO_STAFF = 'STAFF';
    public const WITHHELD_FROM_REPORTED_PARTY = 'WITHHELD_REPORTED_PARTY';
    public const WITHHELD_FROM_OTHER = 'WITHHELD_NOT_REPORTER_OR_STAFF';

    public function __construct(
        public readonly string $reportId,
        public readonly string $reporterId,
        public readonly string $subjectType,
        public readonly string $subjectId,
        public readonly string $reportedAccountId,
        public readonly string $reason,
        public readonly string $state,
        public readonly ?string $body,
        public readonly string $bodyVisibility,
        public readonly ?string $withheldReason,
    ) {
    }

    public function bodyWasWithheld(): bool
    {
        return $this->body === null;
    }
}
