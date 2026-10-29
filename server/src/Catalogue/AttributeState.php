<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * The attribute-definition lifecycle. A DRAFT definition cannot be bound into a
 * published version, because a published vocabulary may not depend on a question
 * somebody is still writing.
 */
enum AttributeState: string
{
    case Draft = 'DRAFT';
    case Live = 'LIVE';
    case Retired = 'RETIRED';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $state): string => $state->value, self::cases());
    }
}
