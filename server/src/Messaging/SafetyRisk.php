<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * How much attention a finding deserves, stated as a band rather than a score.
 *
 * INFORMATIONAL exists because the brief's false-positive case is real: a seller
 * posting the landline of the shop where a buyer can view a watch is a contact
 * detail, and treating it as the same event as "let's talk on WhatsApp" would make
 * the safety queue useless within a week.
 */
enum SafetyRisk: string
{
    case INFORMATIONAL = 'INFORMATIONAL';
    case ELEVATED = 'ELEVATED';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $risk): string => $risk->value, self::cases());
    }
}
