<?php

declare(strict_types=1);

namespace NasTech\Payouts;

/**
 * A bank field carried something that must never be stored: a full account
 * number, an ID number, or a card number.
 *
 * The refusal names the field and the class of detail, and deliberately does
 * NOT echo the value. An exception message ends up in logs, and a log line
 * that quotes the account number is the same leak the refusal existed to stop.
 * `kind` is one of the constants here so a test can assert *which* sensitive
 * shape was detected rather than only that something failed.
 */
final class SensitiveBankDetailRefused extends \DomainException
{
    public const ACCOUNT_NUMBER = 'account_number';
    public const ID_NUMBER = 'id_number';
    public const CARD_NUMBER = 'card_number';

    public function __construct(
        public readonly string $kind,
        public readonly string $field,
    ) {
        parent::__construct(sprintf(
            'Refusing %s in bank destination field "%s": only a bank brand and the last four digits may be stored',
            $kind,
            $field,
        ));
    }
}
