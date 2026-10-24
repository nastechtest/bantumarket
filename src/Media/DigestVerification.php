<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * One digest verification, as an immutable fact.
 *
 * The record in `media.assets` moves through its state ladder; this row does not.
 * It says what the declared digest was, what the bytes at the content address
 * actually hashed to, who looked, and when. A retry of the same verification for
 * the same asset and outcome is the same fact, which is why the id is derived from
 * both and the DDL declares (asset_id, result) unique.
 *
 * What this class does not do: decide whether the asset may publish. That is
 * MediaRecord::publish() and `only_a_verified_digest_leaves_staged`; a MISMATCH row
 * exists to explain a rejection, not to authorise anything.
 */
final class DigestVerification
{
    private function __construct(
        public readonly string $id,
        public readonly string $assetId,
        public readonly Digest $declared,
        public readonly Digest $observed,
        public readonly VerificationResult $result,
        public readonly \DateTimeImmutable $observedAt,
        public readonly string $observedBy,
    ) {
    }

    public static function match(
        string $assetId,
        Digest $declared,
        Digest $observed,
        \DateTimeImmutable $at,
        string $observedBy,
    ): self {
        return self::record($assetId, $declared, $observed, VerificationResult::MATCH, $at, $observedBy);
    }

    public static function mismatch(
        string $assetId,
        Digest $declared,
        Digest $observed,
        \DateTimeImmutable $at,
        string $observedBy,
    ): self {
        return self::record($assetId, $declared, $observed, VerificationResult::MISMATCH, $at, $observedBy);
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        $result = VerificationResult::tryFrom((string) $row['result'])
            ?? throw new MediaRefused(
                'Digest verification ' . $row['id'] . ' has a result this module cannot interpret: ' . $row['result']
            );

        return new self(
            id: (string) $row['id'],
            assetId: (string) $row['asset_id'],
            declared: Digest::fromHex((string) $row['declared_sha256']),
            observed: Digest::fromHex((string) $row['observed_sha256']),
            result: $result,
            observedAt: new \DateTimeImmutable((string) $row['observed_at']),
            observedBy: (string) $row['observed_by'],
        );
    }

    /** @return array<string,mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'asset_id' => $this->assetId,
            'declared_sha256' => $this->declared->hex,
            'observed_sha256' => $this->observed->hex,
            'result' => $this->result->value,
            'observed_at' => $this->observedAt->format(\DateTimeInterface::ATOM),
            'observed_by' => $this->observedBy,
        ];
    }

    private static function record(
        string $assetId,
        Digest $declared,
        Digest $observed,
        VerificationResult $result,
        \DateTimeImmutable $at,
        string $observedBy,
    ): self {
        if (trim($observedBy) === '') {
            throw new MediaRefused(
                'A digest verification must name who performed it; `a_verification_names_its_observer` '
                . 'is the same rule in the DDL.'
            );
        }
        if ($result === VerificationResult::MATCH && !$declared->equals($observed)) {
            throw new MediaRefused(
                'A MATCH cannot name two different digests: a verification that says yes to different '
                . 'bytes is worse than no verification at all.'
            );
        }

        return new self(
            id: MediaId::forVerification($assetId, $result->value),
            assetId: $assetId,
            declared: $declared,
            observed: $observed,
            result: $result,
            observedAt: $at,
            observedBy: $observedBy,
        );
    }
}
