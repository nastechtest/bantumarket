<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * What a pattern detector can say it saw. These are categories of *text*, not
 * verdicts about a person: "this message contains a mobile number" is a fact;
 * "this seller is a scammer" is not something Messaging is allowed to conclude.
 */
enum SafetyCategory: string
{
    case CONTACT_DETAILS = 'CONTACT_DETAILS';
    case OFF_PLATFORM_MIGRATION = 'OFF_PLATFORM_MIGRATION';
    case PAYMENT_INSTRUCTION = 'PAYMENT_INSTRUCTION';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $category): string => $category->value, self::cases());
    }
}
