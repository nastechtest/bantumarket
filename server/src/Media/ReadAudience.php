<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * Who is asking to read the bytes, and therefore what they may see.
 *
 * Three audiences because there are three genuinely different questions, and
 * collapsing them is how an evidence photo turns up in a gallery:
 *
 * - `public` is an anonymous buyer's gallery. It requires a PUBLISHED record whose
 *   purpose is publicly renderable, which excludes evidence twice over.
 * - `owner` is the account the record belongs to, in any state, including one that
 *   was never published and one that was rejected.
 * - `evidence_review` is a named reviewer looking at a dispute. It only ever works
 *   on an evidence record, so a URL minted for review cannot be reused to render a
 *   listing image, and vice versa.
 */
enum ReadAudience: string
{
    case PUBLIC_GALLERY = 'public';
    case OWNER = 'owner';
    case EVIDENCE_REVIEW = 'evidence_review';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $c): string => $c->value, self::cases());
    }
}
