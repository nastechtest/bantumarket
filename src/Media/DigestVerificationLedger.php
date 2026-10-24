<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * Where digest verifications are kept. Append-only: there is no update and no
 * delete in this interface, which is the first of the three layers that make the
 * evidence immutable (the DDL trigger and the grant are the other two).
 */
interface DigestVerificationLedger
{
    /**
     * Record the fact. A retry of the same verification for the same asset and
     * outcome resolves to the row that already exists rather than throwing:
     * idempotency is the unique index behaving as designed, not a pre-check.
     */
    public function record(DigestVerification $verification): DigestVerification;

    /**
     * @return list<DigestVerification>
     */
    public function forAsset(string $assetId): array;

    public function findById(string $id): ?DigestVerification;

    public function count(): int;
}
