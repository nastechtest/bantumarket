<?php

declare(strict_types=1);

namespace NasTech\Payouts;

/**
 * A payout the module will not build, approve or reverse.
 *
 * The reason is a code, not a sentence, because two callers need different
 * things from the same refusal: the HTTP edge maps the code to a message for a
 * staff member, and the tests assert the exact rule that fired rather than
 * matching prose. The message names the reason too, so a log line is readable
 * without a lookup table.
 *
 * Why this is typed rather than "the handler returned false": a payout that was
 * silently zeroed, shrunk to the balance, or skipped is indistinguishable from
 * one that succeeded. The brief is explicit — refuse and name the reason.
 */
final class PayoutRefused extends \DomainException
{
    public const OVER_PAYABLE_BALANCE = 'over_payable_balance';
    public const NEGATIVE_BALANCE = 'negative_balance';
    public const ORDER_IN_DISPUTE = 'order_in_dispute';
    public const ACCOUNT_SANCTIONED = 'account_sanctioned';
    public const UNKNOWN_ACCOUNT = 'unknown_account';
    public const MAKER_CANNOT_APPROVE = 'maker_cannot_approve';
    public const PAYOUT_KEY_REUSED = 'payout_key_reused';
    public const DUPLICATE_ORDER = 'duplicate_order';
    public const EMPTY_BATCH = 'empty_batch';
    public const INVALID_AMOUNT = 'invalid_amount';
    public const MISSING_PREPARER = 'missing_preparer';
    public const MISSING_APPROVER = 'missing_approver';
    public const MISSING_REASON = 'missing_reason';
    public const INVALID_STATE = 'invalid_state';
    public const LEDGER_ROW_MISSING = 'ledger_row_missing';

    public function __construct(
        public readonly string $reason,
        string $detail,
    ) {
        parent::__construct(sprintf('Payout refused (%s): %s', $reason, $detail));
    }
}
