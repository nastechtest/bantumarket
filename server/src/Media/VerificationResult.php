<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * The two outcomes of proving bytes against a declared digest.
 *
 * Backed strings because the value lands in `media.digest_verifications.result`
 * and in the row the dispute console reads. A boolean here would be cheaper and
 * would lose the token that makes the database CHECK readable.
 */
enum VerificationResult: string
{
    case MATCH = 'MATCH';
    case MISMATCH = 'MISMATCH';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $c): string => $c->value, self::cases());
    }
}
