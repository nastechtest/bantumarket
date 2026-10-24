<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * Coarse-to-fine tiers, exactly the contract's `LodTier` union.
 *
 * Lowercase, unlike RenditionKind, because the contract spells them that way and
 * a manifest key is a string the client indexes on — not a place to normalise.
 * `poster` is a tier as well as a rendition kind: the static path is the cheapest
 * thing in the ladder, and the viewer's byte guard picks against this value.
 */
enum LodTier: string
{
    case LOD0 = 'lod0';
    case LOD1 = 'lod1';
    case LOD2 = 'lod2';
    case POSTER = 'poster';

    /** Coarsest first: the order is the ladder, and a manifest lists one entry per tier. */
    public function rank(): int
    {
        return match ($this) {
            self::LOD0 => 0,
            self::LOD1 => 1,
            self::LOD2 => 2,
            self::POSTER => 3,
        };
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $c): string => $c->value, self::cases());
    }
}
