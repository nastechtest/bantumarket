<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * The SQL media repository.
 *
 * Written against db/migrations/003_media.sql and against Schema::ASSET_COLUMNS,
 * which is also the column list MediaRecord::toArray() produces. The insert is
 * generated from that list rather than typed twice: a column that exists in the
 * model and not in the INSERT is row data silently dropped, and a column in the
 * INSERT and not in the DDL is a deploy-time failure. tests/Media/SqlMediaRepositoryTest.php
 * asserts both against the recording executor.
 *
 * The optimistic lock is visible in the WHERE: `id = :id AND version = :expected`.
 * On zero affected rows the follow-up SELECT distinguishes "never inserted" from
 * "lost the race"; a repository that read-modify-wrote without that predicate
 * would quietly restore a state another writer had already moved past.
 */
final class SqlMediaRepository implements MediaRepository
{
    public function __construct(private readonly SqlExecutor $executor)
    {
    }

    public function save(MediaRecord $record): void
    {
        $row = $record->toArray();

        $assignments = [];
        $params = [];
        foreach (Schema::ASSET_COLUMNS as $column) {
            if ($column === 'id') {
                continue;
            }
            $assignments[] = $column . ' = :' . $column;
            $params[$column] = self::bind($row[$column]);
        }
        $params['id'] = $record->id;
        $params['expected_version'] = $record->loadedVersion();

        $updated = $this->executor->execute(SqlStatement::selecting(
            'UPDATE media.assets SET ' . implode(', ', $assignments) . '
             WHERE id = :id AND version = :expected_version
             RETURNING version',
            $params,
        ));

        if ($updated !== []) {
            return;
        }

        $found = $this->executor->execute(SqlStatement::selecting(
            'SELECT version FROM media.assets WHERE id = :id',
            ['id' => $record->id],
        ));

        if ($found === []) {
            $columns = Schema::ASSET_COLUMNS;
            $placeholders = array_map(static fn (string $c): string => ':' . $c, $columns);
            $insertParams = [];
            foreach ($columns as $column) {
                $insertParams[$column] = self::bind($row[$column]);
            }

            $this->executor->execute(SqlStatement::selecting(
                'INSERT INTO media.assets (' . implode(', ', $columns) . ')
                 VALUES (' . implode(', ', $placeholders) . ')
                 ON CONFLICT (id) DO NOTHING
                 RETURNING id',
                $insertParams,
            ));

            return;
        }

        throw new StaleMediaVersion(sprintf(
            'Media %s was loaded at version %d but the row now holds %d; refusing to overwrite',
            $record->id,
            $record->loadedVersion(),
            (int) $found[0]['version'],
        ));
    }

    public function find(string $id): ?MediaRecord
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT * FROM media.assets WHERE id = :id',
            ['id' => $id],
        ));

        return $rows === [] ? null : MediaRecord::fromRow($rows[0]);
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
        $sql = 'SELECT * FROM media.assets WHERE sha256 = :sha256';
        $params = ['sha256' => $digest->hex];

        if ($kind === null) {
            $sql .= ' AND rendition_kind IS NULL';
        } else {
            $sql .= ' AND rendition_kind = :rendition_kind';
            $params['rendition_kind'] = $kind->value;
        }

        if ($lod === null) {
            $sql .= ' AND lod_tier IS NULL';
        } else {
            $sql .= ' AND lod_tier = :lod_tier';
            $params['lod_tier'] = $lod->value;
        }

        if ($ownerAccountId !== null) {
            $sql .= ' AND owner_account_id = :owner_account_id';
            $params['owner_account_id'] = $ownerAccountId;
        }

        $rows = $this->executor->execute(SqlStatement::selecting($sql . ' LIMIT 1', $params));

        return $rows === [] ? null : MediaRecord::fromRow($rows[0]);
    }

    public function findByOwner(string $ownerAccountId): array
    {
        return $this->hydrate($this->executor->execute(SqlStatement::selecting(
            'SELECT * FROM media.assets WHERE owner_account_id = :owner ORDER BY created_at ASC',
            ['owner' => $ownerAccountId],
        )));
    }

    public function findBySource(string $sourceRecordId): array
    {
        return $this->hydrate($this->executor->execute(SqlStatement::selecting(
            'SELECT * FROM media.assets WHERE source_asset_id = :source ORDER BY created_at ASC',
            ['source' => $sourceRecordId],
        )));
    }

    public function dueForPurge(\DateTimeImmutable $at): array
    {
        return $this->hydrate($this->executor->execute(SqlStatement::selecting(
            'SELECT * FROM media.assets
              WHERE purge_after_at IS NOT NULL AND purge_after_at <= :at
              ORDER BY (rendition_kind IS NULL) ASC, created_at ASC',
            ['at' => $at->format(\DateTimeInterface::ATOM)],
        )));
    }

    public function remove(string $id): void
    {
        // Runs as the maintenance role; nastech_app has no DELETE on this table.
        $this->executor->execute(new SqlStatement(
            'DELETE FROM media.assets WHERE id = :id',
            ['id' => $id],
        ));
    }

    public function count(): int
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT count(*) AS total FROM media.assets',
        ));

        return $rows === [] ? 0 : (int) $rows[0]['total'];
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return list<MediaRecord>
     */
    private function hydrate(array $rows): array
    {
        return array_map(static fn (array $row): MediaRecord => MediaRecord::fromRow($row), $rows);
    }

    private static function bind(mixed $value): mixed
    {
        return is_bool($value) ? ($value ? 'true' : 'false') : $value;
    }
}
