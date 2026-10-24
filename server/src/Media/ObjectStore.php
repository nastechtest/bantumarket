<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * The byte store behind a content address.
 *
 * Deliberately small: four operations, and every one of them is addressed by a
 * StorageKey rather than by a caller-chosen name. This is the seam an S3-compatible
 * bucket sits behind in production; here it is an in-memory implementation, and
 * there is no network to reach.
 *
 * The one rule that is not plumbing is put()'s immutability. A key that already
 * holds different content refuses the write, which is what makes "the bytes a record
 * describes" a fact rather than a hope: nothing can quietly replace what a published
 * media id points at, so a dispute reader gets the same bytes a buyer got.
 */
interface ObjectStore
{
    /**
     * @throws ObjectStoreConflict when the key already holds different bytes
     */
    public function put(StorageKey $key, string $bytes, string $mime): void;

    public function read(StorageKey $key): ?string;

    public function exists(StorageKey $key): bool;

    /**
     * Only the purge sweep calls this, and only after the retention rules in
     * MediaRecord::assertPurgeableAt() have said yes.
     */
    public function remove(StorageKey $key): void;

    /**
     * Objects held, by key. The reconciliation surface ADR 0002 is about: records
     * counted against bytes counted is how the ≈R270 per item can be checked.
     */
    public function objectCount(): int;
}
