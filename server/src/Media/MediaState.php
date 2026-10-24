<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * The state ladder of a media record: STAGED → VERIFIED → PUBLISHED → RETIRED,
 * with REJECTED reachable from either of the first two.
 *
 * Nothing is ever moved backwards and no content is overwritten in place, because
 * a dispute may need the exact bytes a buyer saw last week. A re-shoot is a new
 * record with a new digest, not an edit of this one.
 */
enum MediaState: string
{
    case STAGED = 'STAGED';
    case VERIFIED = 'VERIFIED';
    case PUBLISHED = 'PUBLISHED';
    case RETIRED = 'RETIRED';
    case REJECTED = 'REJECTED';

    public function isTerminal(): bool
    {
        return $this === self::RETIRED || $this === self::REJECTED;
    }

    /**
     * True once the bytes have been proven to be the bytes the record names.
     * Everything downstream — publish, read URL, rendition registration — is
     * conditioned on this rather than on the state alone, so a record that was
     * pushed forward by a hand-edited row still cannot be rendered.
     */
    public function impliesDigestVerified(): bool
    {
        return $this !== self::STAGED && $this !== self::REJECTED;
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $c): string => $c->value, self::cases());
    }
}
