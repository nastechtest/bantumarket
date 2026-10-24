<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * What a derived artefact *is*, in the client's vocabulary.
 *
 * Transcribed from `RenditionKind` in
 * `packages/api-contracts/src/index.ts` of the sibling frontend repository, and
 * `tests/Media/RenditionLineageTest.php` compares this list against that file at
 * run time rather than trusting the transcription to have been kept up to date.
 * A second vocabulary here is how a manifest advertises a rendition the viewer
 * has no loader for.
 *
 * Deliberately absent: a "none"/"source" sentinel. A source record carries NULL
 * in `rendition_kind`, and inventing a sentinel value would put a token on the
 * wire that no frontend can interpret — see the note on the unique index in
 * db/migrations/003_media.sql for why that costs a partial index instead.
 */
enum RenditionKind: string
{
    case MODEL = 'MODEL';
    case SPRITE = 'SPRITE';
    case POSTER = 'POSTER';
    case MACRO = 'MACRO';
    case THUMBNAIL = 'THUMBNAIL';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $c): string => $c->value, self::cases());
    }
}
