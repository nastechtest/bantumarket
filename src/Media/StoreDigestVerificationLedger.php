<?php

declare(strict_types=1);

namespace NasTech\Media;

use NasTech\SharedKernel\Persistence\Store;
use NasTech\SharedKernel\Persistence\UniqueConstraintViolation;

/**
 * The in-memory verification ledger.
 *
 * record() deliberately lets the unique index do the idempotency work: it inserts,
 * catches the structural duplicate, and returns the row that exists. A pre-check
 * would have a window between reading and writing; the index does not.
 */
final class StoreDigestVerificationLedger implements DigestVerificationLedger
{
    public const TABLE = 'media_digest_verifications';

    public function __construct(private readonly Store $store)
    {
    }

    public function record(DigestVerification $verification): DigestVerification
    {
        $existing = $this->findById($verification->id);
        if ($existing !== null) {
            return $existing;
        }

        try {
            $this->store->insert(self::TABLE, $verification->toArray());
        } catch (UniqueConstraintViolation) {
            // The same (asset, result) at the same derived id: a retry, not a
            // second fact. Resolve to the row the first attempt wrote.
            $existing = $this->findById($verification->id);
            if ($existing === null) {
                throw new \RuntimeException(
                    'A digest verification collided on the unique index but the existing row cannot be found: '
                    . $verification->id
                );
            }

            return $existing;
        }

        return $verification;
    }

    public function forAsset(string $assetId): array
    {
        $found = [];
        foreach ($this->store->all(self::TABLE) as $row) {
            if ((string) $row['asset_id'] === $assetId) {
                $found[] = DigestVerification::fromRow($row);
            }
        }

        usort($found, static fn (DigestVerification $a, DigestVerification $b): int => $a->observedAt <=> $b->observedAt);

        return $found;
    }

    public function findById(string $id): ?DigestVerification
    {
        $row = $this->store->find(self::TABLE, $id);

        return $row === null ? null : DigestVerification::fromRow($row);
    }

    public function count(): int
    {
        return count($this->store->all(self::TABLE));
    }
}
