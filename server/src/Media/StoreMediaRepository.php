<?php

declare(strict_types=1);

namespace NasTech\Media;

use NasTech\SharedKernel\Persistence\Store;

/**
 * The store-backed media repository: insert, or compare-and-swap on the version
 * the aggregate was loaded at.
 *
 * The CAS predicate is the same shape as the account and order repositories. A
 * save at a version that does not advance the stored one is refused even when the
 * versions happen to match, because an update that changes nothing is a lost
 * update waiting to be mistaken for a successful one. `media.assets_version_monotonic`
 * repeats the refusal for writes that never load an aggregate.
 */
final class StoreMediaRepository implements MediaRepository
{
    public const TABLE = 'media_assets';

    public function __construct(private readonly Store $store)
    {
    }

    public function save(MediaRecord $record): void
    {
        $row = $record->toArray();
        $existing = $this->store->find(self::TABLE, $record->id);

        if ($existing === null) {
            // A structural duplicate is left to the store's unique emulation; the
            // caller (StageMedia) resolves a timeout retry to the existing row.
            $this->store->insert(self::TABLE, $row);

            return;
        }

        if ((int) $existing['version'] !== $record->loadedVersion()) {
            throw new StaleMediaVersion(sprintf(
                'Media %s was loaded at version %d but the store now holds %d; refusing to overwrite',
                $record->id,
                $record->loadedVersion(),
                (int) $existing['version'],
            ));
        }
        if ($record->version <= $record->loadedVersion()) {
            throw new StaleMediaVersion(sprintf(
                'Media %s is being saved without any change since it was loaded at version %d',
                $record->id,
                $record->loadedVersion(),
            ));
        }

        $this->store->update(self::TABLE, $row);
    }

    public function find(string $id): ?MediaRecord
    {
        $row = $this->store->find(self::TABLE, $id);

        return $row === null ? null : MediaRecord::fromRow($row);
    }

    public function require(string $id): MediaRecord
    {
        $record = $this->find($id);
        if ($record === null) {
            throw new MediaRefused("Unknown media record: {$id}");
        }

        return $record;
    }

    public function findByContentAddress(
        Digest $digest,
        ?RenditionKind $kind,
        ?LodTier $lod,
        ?string $ownerAccountId = null,
    ): ?MediaRecord {
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['sha256'] !== $digest->hex) {
                continue;
            }
            if (($row['rendition_kind'] ?? null) !== ($kind?->value)) {
                continue;
            }
            if (($row['lod_tier'] ?? null) !== ($lod?->value)) {
                continue;
            }
            if ($ownerAccountId !== null && (string) $row['owner_account_id'] !== $ownerAccountId) {
                continue;
            }

            return MediaRecord::fromRow($row);
        }

        return null;
    }

    public function findByOwner(string $ownerAccountId): array
    {
        $found = [];
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['owner_account_id'] === $ownerAccountId) {
                $found[] = MediaRecord::fromRow($row);
            }
        }

        usort($found, static fn (MediaRecord $a, MediaRecord $b): int => $a->createdAt <=> $b->createdAt);

        return $found;
    }

    public function findBySource(string $sourceRecordId): array
    {
        $found = [];
        foreach ($this->store->all(self::TABLE) as $row) {
            if (($row['source_asset_id'] ?? null) === $sourceRecordId) {
                $found[] = MediaRecord::fromRow($row);
            }
        }

        return $found;
    }

    public function dueForPurge(\DateTimeImmutable $at): array
    {
        $found = [];
        foreach ($this->store->all(self::TABLE) as $row) {
            if ($row['purge_after_at'] === null) {
                continue;
            }
            if (new \DateTimeImmutable((string) $row['purge_after_at']) > $at) {
                continue;
            }
            $found[] = MediaRecord::fromRow($row);
        }

        // Renditions before their sources: the DDL's source foreign key is
        // ON DELETE RESTRICT, so a sweep that removed a source first would fail on
        // the very rows it was asked to purge.
        usort($found, static fn (MediaRecord $a, MediaRecord $b): int => ($b->isRendition() <=> $a->isRendition()));

        return $found;
    }

    public function remove(string $id): void
    {
        if (!$this->store instanceof \NasTech\SharedKernel\Persistence\InMemoryStore) {
            throw new \LogicException('StoreMediaRepository::remove() needs the in-memory store');
        }
        $this->store->delete(self::TABLE, $id);
    }

    public function count(): int
    {
        return count($this->store->all(self::TABLE));
    }
}
