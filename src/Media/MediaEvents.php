<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * The events Media puts on the transactional outbox, and their payloads.
 *
 * Three events, matching the brief: VERIFIED, PUBLISHED, RETIRED. Nothing else is
 * published — a staged upload is a private fact about a byte string, and a rejection
 * is a refusal rather than a state other modules must react to.
 *
 * Media consumes nothing. There is no inbox, no subscriber and no handler in this
 * module, and tests/Media/BoundaryTest.php asserts the absence rather than trusting
 * the README to keep saying it.
 *
 * What is deliberately absent from every payload: a URL. A signed read URL is a
 * credential with a TTL, and putting one in an event row would put it in the outbox,
 * in whatever reads the outbox, and in the log of whatever delivers it. Consumers
 * call SignedUrlIssuer with their own audience instead.
 *
 * What is deliberately present in every payload: `publicly_renderable`. A consumer
 * that projects media into a search index or a listing tile must not have to
 * re-derive the purpose rule, and a projection that re-derives it wrong is how
 * evidence shows up in a gallery.
 */
final class MediaEvents
{
    public const AGGREGATE_TYPE = 'Media';

    public const VERIFIED = 'MediaVerified';
    public const PUBLISHED = 'MediaPublished';
    public const RETIRED = 'MediaRetired';

    /** @return list<string> */
    public static function names(): array
    {
        return [self::VERIFIED, self::PUBLISHED, self::RETIRED];
    }

    /**
     * @return array<string,mixed>
     */
    public static function verified(MediaRecord $record): array
    {
        return self::identity($record) + [
            'verified_at' => self::stamp($record->verifiedAt),
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public static function published(MediaRecord $record): array
    {
        return self::identity($record) + [
            'published_at' => self::stamp($record->publishedAt),
            'mime' => $record->mime,
            'width_px' => $record->widthPx,
            'height_px' => $record->heightPx,
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public static function retired(MediaRecord $record): array
    {
        return self::identity($record) + [
            'retired_at' => self::stamp($record->retiredAt),
            // The reason travels, because a projection that keeps showing a retired
            // asset needs to say why it stopped.
            'reason' => $record->retirementReason,
        ];
    }

    /**
     * The fields every consumer keys on. `publicly_renderable` is computed here from
     * purpose and state, so a payload cannot advertise a record as renderable that
     * the issuer would refuse to sign for.
     *
     * @return array<string,mixed>
     */
    private static function identity(MediaRecord $record): array
    {
        return [
            'media_id' => $record->id,
            'purpose' => $record->purpose->value,
            'state' => $record->state->value,
            'sha256' => $record->digest->hex,
            'storage_key' => $record->storageKey->value,
            'size_bytes' => $record->sizeBytes,
            'rendition_kind' => $record->renditionKind?->value,
            'lod_tier' => $record->lodTier?->value,
            'source_media_id' => $record->sourceRecordId,
            'retention_class' => $record->retentionClass->value,
            'publicly_renderable' => $record->purpose->isPubliclyRenderable()
                && $record->state === MediaState::PUBLISHED,
        ];
    }

    private static function stamp(?\DateTimeImmutable $at): ?string
    {
        return $at?->format(\DateTimeInterface::ATOM);
    }

    private function __construct()
    {
    }
}
