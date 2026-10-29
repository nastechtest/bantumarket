<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * The category lifecycle from the DDL.
 *
 * DRAFT has no published vocabulary yet. LIVE points at an immutable version.
 * RETIRED and MERGED are both decommissioned: each is a forwarding pointer to a
 * successor, because a category that closes without saying where its listings go
 * is exactly the stranding this module exists to refuse.
 */
enum CategoryState: string
{
    case Draft = 'DRAFT';
    case Live = 'LIVE';
    case Retired = 'RETIRED';
    case Merged = 'MERGED';

    public function isDecommissioned(): bool
    {
        return $this === self::Retired || $this === self::Merged;
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $state): string => $state->value, self::cases());
    }
}
