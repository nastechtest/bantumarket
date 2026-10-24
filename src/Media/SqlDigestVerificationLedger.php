<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * The SQL verification ledger.
 *
 * The INSERT ... ON CONFLICT DO NOTHING is the same resolution the in-memory
 * ledger performs: the unique index decides, and a retry returns the row that
 * exists. The re-read is not a pre-check; it happens only after the database has
 * already refused to create a second fact.
 */
final class SqlDigestVerificationLedger implements DigestVerificationLedger
{
    public function __construct(private readonly SqlExecutor $executor)
    {
    }

    public function record(DigestVerification $verification): DigestVerification
    {
        $row = $verification->toArray();

        $this->executor->execute(new SqlStatement(
            'INSERT INTO media.digest_verifications
                (id, asset_id, declared_sha256, observed_sha256, result, observed_at, observed_by)
             VALUES
                (:id, :asset_id, :declared_sha256, :observed_sha256, :result, :observed_at, :observed_by)
             ON CONFLICT (asset_id, result) DO NOTHING',
            [
                'id' => $row['id'],
                'asset_id' => $row['asset_id'],
                'declared_sha256' => $row['declared_sha256'],
                'observed_sha256' => $row['observed_sha256'],
                'result' => $row['result'],
                'observed_at' => $row['observed_at'],
                'observed_by' => $row['observed_by'],
            ],
        ));

        return $this->findById($verification->id) ?? $verification;
    }

    public function forAsset(string $assetId): array
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT * FROM media.digest_verifications WHERE asset_id = :asset_id ORDER BY observed_at ASC',
            ['asset_id' => $assetId],
        ));

        return array_map(static fn (array $row): DigestVerification => DigestVerification::fromRow($row), $rows);
    }

    public function findById(string $id): ?DigestVerification
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT * FROM media.digest_verifications WHERE id = :id',
            ['id' => $id],
        ));

        return $rows === [] ? null : DigestVerification::fromRow($rows[0]);
    }

    public function count(): int
    {
        $rows = $this->executor->execute(SqlStatement::selecting(
            'SELECT count(*) AS total FROM media.digest_verifications',
        ));

        return $rows === [] ? 0 : (int) $rows[0]['total'];
    }
}
