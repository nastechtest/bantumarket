<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * A report about a person, listing or message.
 *
 * The body is stored because a reviewer needs it, and it is the one column
 * this module treats as radioactive. Two rules protect it:
 *
 *   1. it cannot be written until PersonalDataScreen has refused phone, ID,
 *      card, street-address and survivor-detail shapes; and
 *   2. it is returned only through SafetyService::readReport(), which never
 *      hands it to the account the report is about — even when that account
 *      is staff.
 *
 * The aggregate itself is not a read model. A caller that reaches into
 * `$report->body` has bypassed the retrieval rule deliberately; the service is
 * the path the HTTP edge uses and the path the tests exercise.
 */
final class Report
{
    public function __construct(
        public readonly string $id,
        public readonly string $reporterId,
        public readonly string $subjectType,
        public readonly string $subjectId,
        public readonly string $reportedAccountId,
        public readonly string $reason,
        public readonly string $body,
        public readonly string $state,
        public readonly int $version,
        public readonly \DateTimeImmutable $createdAt,
    ) {
        if ($id === '' || $reporterId === '' || $subjectId === '' || $reportedAccountId === '') {
            throw new SafetyRuleViolation('A report names itself, its reporter, its subject and the account it is about');
        }
        if (!ReportReason::isValid($reason)) {
            throw new SafetyRuleViolation(sprintf('Unknown report reason "%s"; the vocabulary is closed', $reason));
        }
        if (!ReportSubjectType::isValid($subjectType)) {
            throw new SafetyRuleViolation(sprintf('Unknown report subject "%s"; expected a listing, seller, buyer or message', $subjectType));
        }
        if (!ReportState::isValid($state)) {
            throw new SafetyRuleViolation(sprintf('Unknown report state "%s"', $state));
        }
        if ($reporterId === $reportedAccountId) {
            throw new SafetyRuleViolation('An account cannot report itself');
        }
        if (trim($body) === '') {
            throw new SafetyRuleViolation('A report body is required');
        }
        if (strlen($body) > PersonalDataScreen::MAX_BODY_BYTES) {
            throw new SafetyRuleViolation(sprintf(
                'A report body is limited to %d bytes',
                PersonalDataScreen::MAX_BODY_BYTES,
            ));
        }
        if ($version < 1) {
            throw new SafetyRuleViolation('A report starts at version 1');
        }
    }

    public static function file(
        string $id,
        string $reporterId,
        string $subjectType,
        string $subjectId,
        string $reportedAccountId,
        string $reason,
        string $body,
        \DateTimeImmutable $at,
    ): self {
        $trimmed = trim($body);
        PersonalDataScreen::assertClean($trimmed);

        return new self(
            id: $id,
            reporterId: $reporterId,
            subjectType: $subjectType,
            subjectId: $subjectId,
            reportedAccountId: $reportedAccountId,
            reason: $reason,
            body: $trimmed,
            state: ReportState::OPEN,
            version: 1,
            createdAt: $at,
        );
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            reporterId: (string) $row['reporter_id'],
            subjectType: (string) $row['subject_type'],
            subjectId: (string) $row['subject_id'],
            reportedAccountId: (string) $row['reported_account_id'],
            reason: (string) $row['reason'],
            body: (string) $row['body'],
            state: (string) $row['state'],
            version: (int) $row['version'],
            createdAt: new \DateTimeImmutable((string) $row['created_at']),
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'reporter_id' => $this->reporterId,
            'subject_type' => $this->subjectType,
            'subject_id' => $this->subjectId,
            'reported_account_id' => $this->reportedAccountId,
            'reason' => $this->reason,
            'body' => $this->body,
            'state' => $this->state,
            'version' => $this->version,
            'created_at' => $this->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }
}
