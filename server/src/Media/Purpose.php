<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * Why a piece of media exists — the one field that decides who may look at it.
 *
 * The wire strings are the brief's vocabulary and nothing else, and they are
 * backed precisely because the bucket, the manifest and the dispute console all
 * carry the same token. `evidence` is the load-bearing case: it is the only
 * purpose whose whole reason for existing is that it is *not* public, so the
 * rules that follow from it are written as refusals rather than as permissions.
 */
enum Purpose: string
{
    case PHOTO = 'photo';
    case POSTER = 'poster';
    case TURNTABLE_FRAME = 'turntable_frame';
    case MESH = 'mesh';
    case TEXTURE = 'texture';
    case RENDITION = 'rendition';
    case EVIDENCE = 'evidence';

    /**
     * Whether a record with this purpose may ever be rendered to an anonymous
     * buyer. Six of the seven may; `evidence` may not, at any state, in any
     * audience but a named reviewer's.
     *
     * This is the domain half of the rule. The database half is
     * `evidence_is_never_published` in db/migrations/003_media.sql, and the read
     * half is SignedUrlIssuer::issue() — three layers, because the three fail
     * differently and a gallery does not consult the domain object.
     */
    public function isPubliclyRenderable(): bool
    {
        return $this !== self::EVIDENCE;
    }

    /**
     * Evidence is a claim about an item in a dispute, not a picture. It is kept as
     * long as a dispute can be re-opened, which outlives the account that filed
     * it, which outlives the listing it was shot for.
     */
    public function survivesAccountErasure(): bool
    {
        return $this === self::EVIDENCE;
    }

    /**
     * The retention class a record of this purpose may be staged under. Returns
     * the narrowest admissible class so a caller that does not think about
     * retention still cannot stage evidence as a transient upload.
     */
    public function defaultRetentionClass(): RetentionClass
    {
        return match ($this) {
            self::EVIDENCE => RetentionClass::EVIDENCE,
            self::PHOTO, self::POSTER, self::TURNTABLE_FRAME => RetentionClass::LISTING,
            self::MESH, self::TEXTURE, self::RENDITION => RetentionClass::LISTING,
        };
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $c): string => $c->value, self::cases());
    }
}
