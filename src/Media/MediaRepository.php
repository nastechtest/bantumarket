<?php

declare(strict_types=1);

namespace NasTech\Media;

use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;

/**
 * Where media records live, and the only way anything in the module reads them.
 *
 * Two implementations: StoreMediaRepository, which runs against
 * SharedKernel's in-memory store and is what the suite exercises, and
 * SqlMediaRepository, which emits the real PostgreSQL statements against
 * `media.assets` and is what production runs. They are checked against the same
 * column list and the same migration by tests/Media/MediaDdlTest.php, because a
 * repository whose SQL drifted from the DDL is a repository that works in tests and
 * fails on deploy.
 *
 * save() is insert-or-compare-and-swap. It does not offer an "upsert that wins":
 * a duplicate here is either a retry (resolve to the existing row, see MediaId) or a
 * bug, and both read better as an exception than as a silent overwrite.
 */
interface MediaRepository
{
    /**
     * @throws UniqueConstraintViolation when the derived primary key or the
     *                                  (sha256, rendition_kind, lod_tier) triple already exists
     * @throws StaleMediaVersion         when the row moved on since this record was loaded
     */
    public function save(MediaRecord $record): void;

    public function find(string $id): ?MediaRecord;

    /**
     * @throws MediaRefused when there is no such record
     */
    public function require(string $id): MediaRecord;

    /**
     * The content-address lookup a timeout retry lands on. Passing a null kind and
     * tier asks for a source record; passing both asks for the one rendition of
     * those bytes at that tier.
     *
     * The optional owner narrows a source lookup: two accounts may hold
     * byte-identical photographs, and a source record is an act of possession by a
     * named account (MediaId derives it from both). Passing null is the rendition
     * lookup, where content really is the whole identity.
     */
    public function findByContentAddress(
        Digest $digest,
        ?RenditionKind $kind,
        ?LodTier $lod,
        ?string $ownerAccountId = null,
    ): ?MediaRecord;

    /** @return list<MediaRecord> */
    public function findByOwner(string $ownerAccountId): array;

    /** @return list<MediaRecord> */
    public function findBySource(string $sourceRecordId): array;

    /**
     * Records whose purge date has passed. Returning them is not permission to
     * delete them: the retention rules are read per record by the caller.
     *
     * @return list<MediaRecord>
     */
    public function dueForPurge(\DateTimeImmutable $at): array;

    public function remove(string $id): void;

    public function count(): int;
}
