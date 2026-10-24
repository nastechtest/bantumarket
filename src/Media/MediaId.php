<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * The record's identifier, derived from what the record is about.
 *
 * Derived rather than random, and that is the idempotency mechanism: a staging
 * request whose commit was lost to a timeout computes the same id as the first
 * attempt, so the second insert collides with the first row on the primary key and
 * resolves to it. The unique indexes in db/migrations/003_media.sql are the same
 * claim from the other side — an identity collision is the retry, not a second
 * asset.
 *
 * A source record is keyed on (owner, digest): two accounts holding byte-identical
 * photographs get one object in the bucket and two records, because a source upload
 * is an act of possession by a named account.
 *
 * A rendition is keyed on (digest, kind, lod) alone: a rendition is a pure function
 * of content, so there is exactly one of it in the platform, whoever materialised
 * it first. Read authorization does not depend on this (see SignedUrlIssuer), so
 * adopting an existing rendition cannot expose another account's evidence.
 */
final class MediaId
{
    public const SOURCE_PREFIX = 'mda';
    public const RENDITION_PREFIX = 'mdr';

    private function __construct()
    {
    }

    public static function forSource(string $ownerAccountId, Digest $digest): string
    {
        return self::derive(self::SOURCE_PREFIX, $ownerAccountId . '|' . $digest->hex);
    }

    public static function forRendition(Digest $digest, RenditionKind $kind, LodTier $lod): string
    {
        return self::derive(self::RENDITION_PREFIX, $digest->hex . '|' . $kind->value . '|' . $lod->value);
    }

    /**
     * The digest-verification row for one outcome of one record. Keyed on both, so
     * re-running verification after a timeout cannot produce a second MATCH for the
     * same record: the retry collides on the primary key as well as on
     * `media_digest_verification_recorded_once_per_outcome`.
     */
    public static function forVerification(string $recordId, string $result): string
    {
        return self::derive('mdv', $recordId . '|' . $result);
    }

    private static function derive(string $prefix, string $material): string
    {
        // 32 hex characters keeps the id inside the character set and length
        // Id::fromString accepts, and a 128-bit truncation of a sha256 is beyond the
        // collision budget of a media library at this scale by many orders.
        return $prefix . '_' . substr(hash('sha256', $material), 0, 32);
    }
}
