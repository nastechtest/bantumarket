<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * The only confidence this module is allowed to state is PATTERN.
 *
 * There is deliberately no "likely", "probable" or numeric score: a regular
 * expression has no idea whether a human was being defrauded, and an enum with one
 * case makes that impossible to forget when the event reaches Safety.
 */
enum SafetyConfidence: string
{
    case PATTERN = 'pattern';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $confidence): string => $confidence->value, self::cases());
    }
}
