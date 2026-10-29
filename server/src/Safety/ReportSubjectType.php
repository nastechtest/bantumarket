<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * What a report points at. The subject id is opaque: a listing id, an account
 * id or a message id, depending on the type. The reported account is stored
 * separately so the body-visibility rule can be answered without crossing into
 * Listings or Messaging on every read.
 */
final class ReportSubjectType
{
    public const LISTING = 'LISTING';
    public const SELLER = 'SELLER';
    public const BUYER = 'BUYER';
    public const MESSAGE = 'MESSAGE';

    /** @var list<string> */
    public const ALL = [self::LISTING, self::SELLER, self::BUYER, self::MESSAGE];

    public static function isValid(string $type): bool
    {
        return in_array($type, self::ALL, true);
    }

    private function __construct()
    {
    }
}
