<?php

declare(strict_types=1);

namespace NasTech\Media;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Persistence\UnitOfWork;
use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;

/**
 * Stage bytes that have been written to the content-addressed store.
 *
 * The command hashes the bytes it is handed. That is stricter than the brief and
 * deliberate: the bucket key is the digest, so writing bytes at a key that names a
 * different digest would poison an address every later reader trusts. A mismatch is
 * therefore refused before the write, and the verification command re-hashes the
 * bytes it reads back later — which is where an interrupted or corrupted upload is
 * caught and the record is driven to REJECTED.
 *
 * Idempotency comes from the derived primary key. A staging request whose commit
 * was lost to a timeout computes the same id on the retry, the insert collides, and
 * the command resolves to the row that exists. It does not pre-check and then
 * write, because the window between those two is exactly the duplicate.
 */
final class StageMedia
{
    public function __construct(
        private readonly UnitOfWork $uow,
        private readonly MediaRepository $media,
        private readonly ObjectStore $objects,
        private readonly Clock $clock,
    ) {
    }

    public function handle(
        string $ownerAccountId,
        Purpose $purpose,
        string $bytes,
        string $mime,
        RetentionClass $retentionClass,
        string $retentionReason,
        ?int $widthPx = null,
        ?int $heightPx = null,
        ?string $colourProfile = null,
        ?string $sourceDevice = null,
        ?string $captureStation = null,
        ?RenditionKind $renditionKind = null,
        ?LodTier $lodTier = null,
        ?string $sourceRecordId = null,
    ): MediaRecord {
        $digest = Digest::ofBytes($bytes);
        $id = $renditionKind === null
            ? MediaId::forSource($ownerAccountId, $digest)
            : MediaId::forRendition($digest, $renditionKind, $lodTier ?? throw new MediaRefused(
                'A rendition needs a lod tier; `rendition_has_both_halves` is the same rule in the DDL.'
            ));

        $record = MediaRecord::stage(
            id: $id,
            ownerAccountId: $ownerAccountId,
            purpose: $purpose,
            declaredDigest: $digest,
            sizeBytes: strlen($bytes),
            mime: $mime,
            retentionClass: $retentionClass,
            retentionReason: $retentionReason,
            at: $this->clock->now(),
            widthPx: $widthPx,
            heightPx: $heightPx,
            colourProfile: $colourProfile,
            sourceDevice: $sourceDevice,
            captureStation: $captureStation,
            renditionKind: $renditionKind,
            lodTier: $lodTier,
            sourceRecordId: $sourceRecordId,
        );

        // The object is content-addressed and immutable; a repeated put of the same
        // bytes is a no-op. This happens before the transaction because a bucket is
        // not transactional; an orphan on a failed insert is harmless and reused by
        // the retry under the same key.
        $this->objects->put($record->storageKey, $bytes, $mime);

        $ownTransaction = !$this->uow->inTransaction();
        if ($ownTransaction) {
            $this->uow->begin();
        }

        try {
            $existing = $this->media->find($record->id);
            if ($existing !== null) {
                $this->assertSameFact($existing, $record);
                if ($ownTransaction) {
                    $this->uow->commit();
                }

                return $existing;
            }

            $this->media->save($record);
            if ($ownTransaction) {
                $this->uow->commit();
            }

            return $record;
        } catch (UniqueConstraintViolation $duplicate) {
            if (!$ownTransaction) {
                throw $duplicate;
            }
            $this->uow->rollback();

            $existing = $this->media->find($record->id);
            if ($existing === null) {
                // The triple collided but the derived id did not: this is the one
                // duplicate shape the domain does not have an answer for, and it is
                // a bug rather than a retry.
                throw $duplicate;
            }
            $this->assertSameFact($existing, $record);

            return $existing;
        } catch (\Throwable $failure) {
            if ($ownTransaction) {
                $this->uow->rollback();
            }
            throw $failure;
        }
    }

    private function assertSameFact(MediaRecord $existing, MediaRecord $staged): void
    {
        if ($existing->purpose !== $staged->purpose || $existing->digest->hex !== $staged->digest->hex) {
            throw new MediaRefused(sprintf(
                'Media %s already exists as purpose %s for sha256 %s. Content addressing makes that row '
                . 'the fact; staging the same bytes under purpose %s would either rewrite history or '
                . 'create a second address for one object.',
                $existing->id,
                $existing->purpose->value,
                $existing->digest->shortDisplay(),
                $staged->purpose->value,
            ));
        }
    }
}
