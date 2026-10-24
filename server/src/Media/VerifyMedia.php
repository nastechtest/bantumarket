<?php

declare(strict_types=1);

namespace NasTech\Media;

use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\UnitOfWork;

/**
 * Prove the bytes at the content address against the digest the record declares.
 *
 * The observed digest is computed from what the object store really holds, not
 * taken from a caller. That is the only way the brief's rule can be tested: the
 * seam in InMemoryObjectStore truncates an object as an interrupted upload would,
 * and this command is what notices.
 *
 * On a mismatch two things happen and both must survive: the record is driven to
 * REJECTED with a reason, and a MISMATCH verification row is appended. The
 * transaction commits before DigestMismatch is thrown, because a rejection that
 * rolled back would leave the platform holding an almost-right record and no
 * evidence of why it was refused. Inside a caller's transaction (Capture publishing
 * a manifest) the throw aborts the caller and the rejection is not persisted: the
 * whole capture is refused atomically, which is the stronger outcome there.
 */
final class VerifyMedia
{
    public function __construct(
        private readonly UnitOfWork $uow,
        private readonly MediaRepository $media,
        private readonly DigestVerificationLedger $verifications,
        private readonly ObjectStore $objects,
        private readonly Outbox $outbox,
        private readonly Clock $clock,
    ) {
    }

    public function handle(string $mediaId, string $observedBy): MediaRecord
    {
        $record = $this->media->require($mediaId);
        $bytes = $this->objects->read($record->storageKey);
        if ($bytes === null) {
            throw new MediaRefused(sprintf(
                'Media %s has no object at %s. There is nothing to verify, and a record whose bytes '
                . 'are missing is not an asset yet.',
                $mediaId,
                $record->storageKey->value,
            ));
        }

        $observed = Digest::ofBytes($bytes);
        $now = $this->clock->now();

        if (!$observed->equals($record->digest)) {
            return $this->refuseMismatch($record, $observed, $observedBy, $now);
        }

        $ownTransaction = !$this->uow->inTransaction();
        if ($ownTransaction) {
            $this->uow->begin();
        }

        try {
            // A retry of a verification that already committed is the same fact,
            // not a second transition. Record the fact idempotently and return.
            if ($record->digestVerified) {
                $this->verifications->record(
                    DigestVerification::match($record->id, $record->digest, $observed, $now, $observedBy),
                );
                if ($ownTransaction) {
                    $this->uow->commit();
                }

                return $record;
            }

            $record->markVerified($observed, $now);
            $this->media->save($record);
            $this->verifications->record(
                DigestVerification::match($record->id, $record->digest, $observed, $now, $observedBy),
            );
            $this->outbox->publish(
                MediaEvents::AGGREGATE_TYPE,
                $record->id,
                MediaEvents::VERIFIED,
                MediaEvents::verified($record),
            );

            if ($ownTransaction) {
                $this->uow->commit();
            }

            return $record;
        } catch (\Throwable $failure) {
            if ($ownTransaction) {
                $this->uow->rollback();
            }
            throw $failure;
        }
    }

    private function refuseMismatch(
        MediaRecord $record,
        Digest $observed,
        string $observedBy,
        \DateTimeImmutable $now,
    ): MediaRecord {
        $ownTransaction = !$this->uow->inTransaction();
        if ($ownTransaction) {
            $this->uow->begin();
        }

        try {
            $this->verifications->record(
                DigestVerification::mismatch($record->id, $record->digest, $observed, $now, $observedBy),
            );

            // A PUBLISHED or RETIRED record is not moved by a late bad read: the
            // bytes a buyer saw are still the bytes the row names until a real
            // verification says otherwise, and retiring it is a separate decision.
            if ($record->state === MediaState::STAGED || $record->state === MediaState::VERIFIED) {
                $record->markRejected(sprintf(
                    'Digest mismatch: declared sha256 %s, observed %s at %s',
                    $record->digest->hex,
                    $observed->hex,
                    $record->storageKey->value,
                ), $now);
                $this->media->save($record);
            }

            if ($ownTransaction) {
                $this->uow->commit();
            }
        } catch (\Throwable $failure) {
            if ($ownTransaction) {
                $this->uow->rollback();
            }
            throw $failure;
        }

        throw DigestMismatch::between($record->digest, $observed, $record->id);
    }
}
