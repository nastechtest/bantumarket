<?php

declare(strict_types=1);

namespace NasTech\Disputes;

/**
 * A file in the case, referenced by media id and nothing else.
 *
 * Disputes holds pointers. The bytes belong to `Media`, which this module has no edge to
 * and does not need: a case is a record of *what was attached, by whom, when, and with what
 * digest*, and that is everything a decision has to be able to cite. `media_id` is opaque
 * and never dereferenced here.
 *
 * Two ceilings are enforced in the domain rather than the DDL — the per-case file count and
 * the total byte budget — because they are policy the operator tunes, while the two rules
 * that are data (`bytes > 0` and an admissible mime) are CHECK constraints so that an empty
 * or an .exe cannot be committed by anything, including a repair script.
 *
 * The digest is nullable and that is deliberate: a handset with no digest primitive can
 * still submit evidence, and a rejected complaint is worse than an unverified file. The
 * column comment in the migration says so, because "nullable" without a reason is how the
 * next person decides the column is optional for everyone.
 */
final class EvidenceReference
{
    public const TABLE = 'dispute_evidence';

    /**
     * @var list<string> the ceiling this module puts on what a case file will hold. The
     *                   smaller of this and the Media module's own limit is what the HTTP
     *                   edge must enforce; see the README.
     */
    public const ACCEPTED_MIMES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'video/mp4',
        'video/quicktime',
        'application/pdf',
    ];

    public function __construct(
        public readonly string $id,
        public readonly string $mediaId,
        public readonly string $ownerRole,
        public readonly string $mime,
        public readonly int $bytes,
        public readonly ?string $sha256,
        public readonly string $attachedBy,
        public readonly \DateTimeImmutable $attachedAt,
    ) {
        if ($bytes <= 0) {
            throw new DisputeRuleViolation(
                "Evidence {$mediaId} is {$bytes} bytes. An empty file is not evidence and a reviewer "
                . 'should be told so at the door, not after they have opened it.'
            );
        }
        if (!in_array($mime, self::ACCEPTED_MIMES, true)) {
            throw new DisputeRuleViolation(sprintf(
                'Evidence of type "%s" is not admissible in a case file. Accepted: %s',
                $mime,
                implode(', ', self::ACCEPTED_MIMES),
            ));
        }
        if (trim($mediaId) === '') {
            throw new DisputeRuleViolation('Evidence without a media id points at nothing to read');
        }
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(string $caseId): array
    {
        return [
            'id' => $this->id,
            'case_id' => $caseId,
            'media_id' => $this->mediaId,
            'owner_role' => $this->ownerRole,
            'mime' => $this->mime,
            'bytes' => $this->bytes,
            'sha256' => $this->sha256,
            'attached_by' => $this->attachedBy,
            'attached_at' => $this->attachedAt->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            mediaId: (string) $row['media_id'],
            ownerRole: (string) $row['owner_role'],
            mime: (string) $row['mime'],
            bytes: (int) $row['bytes'],
            sha256: $row['sha256'] === null ? null : (string) $row['sha256'],
            attachedBy: (string) $row['attached_by'],
            attachedAt: new \DateTimeImmutable((string) $row['attached_at']),
        );
    }
}
