<?php

declare(strict_types=1);

namespace NasTech\Reporting;

/**
 * The event vocabulary Reporting consumes.
 *
 * Reporting has no outbound edges, so every fact it holds arrives through this
 * list. A metric whose source event is not here is a metric nobody can produce:
 * the correct response is to add the event to the producing module, not to have
 * Reporting query that module's schema. The two money events are deliberately
 * per-row evidence (`LedgerEntryRecorded`, `CommissionEntryRecorded`); a gross
 * total in a summary event cannot be reconciled to the ledger to the cent, and
 * a report that cannot be reconciled is a second opinion.
 */
final class EventType
{
    public const SELLER_ONBOARDED = 'SellerOnboarded';
    public const LISTING_CREATED = 'ListingCreated';
    public const LISTING_WENT_LIVE = 'ListingWentLive';
    public const LISTING_MEDIA_ATTACHED = 'ListingMediaAttached';
    public const SEARCH_PERFORMED = 'SearchPerformed';

    public const PAYMENT_RECORDED = 'PaymentRecorded';
    public const ORDER_COMPLETED = 'OrderCompleted';
    public const REFUND_SETTLED = 'RefundSettled';

    /** Per-row money evidence. See docs/api/endpoint-inventory.md § Reporting contract. */
    public const LEDGER_ENTRY_RECORDED = 'LedgerEntryRecorded';
    public const COMMISSION_ENTRY_RECORDED = 'CommissionEntryRecorded';

    public const PAYOUT_BATCH_BUILT = 'PayoutBatchBuilt';
    public const PAYOUT_BATCH_RELEASED = 'PayoutBatchReleased';
    public const PAYOUT_ATTEMPT_FAILED = 'PayoutAttemptFailed';
    public const PAYOUT_BATCH_DEAD = 'PayoutBatchDead';

    public const DISPUTE_OPENED = 'DisputeOpened';
    public const DISPUTE_DECIDED = 'DisputeDecided';

    public const CAPTURE_JOB_STATE_CHANGED = 'CaptureJobStateChanged';
    public const CAPTURE_JOB_COMPLETED = 'CaptureJobCompleted';

    public const LISTING_VIEWED = 'ListingViewed';

    /**
     * Events whose absence is a broken producer contract rather than an ordinary
     * unknown event. The projection worker records both, but `contractGaps()`
     * makes the difference visible to an operator instead of leaving a report
     * quietly short of money.
     *
     * @return list<string>
     */
    public static function required(): array
    {
        return [
            self::LEDGER_ENTRY_RECORDED,
            self::COMMISSION_ENTRY_RECORDED,
            self::ORDER_COMPLETED,
            self::SEARCH_PERFORMED,
        ];
    }
}
