<?php

declare(strict_types=1);

namespace NasTech\Notifications;

/**
 * What a notification is about, from a closed vocabulary.
 *
 * A kind is not an email template and not a delivery channel. It says which
 * event the recipient must be able to see; the source module and the subject
 * type follow from it, so a producer cannot file "order completed" against a
 * thread. The pairing is enforced here and by
 * notification_kind_matches_its_source in 010_notifications.sql.
 */
enum NotificationKind: string
{
    case MESSAGE_RECEIVED = 'MESSAGE_RECEIVED';
    case ORDER_PLACED = 'ORDER_PLACED';
    case ORDER_COMPLETED = 'ORDER_COMPLETED';
    case DISPUTE_OPENED = 'DISPUTE_OPENED';
    case DISPUTE_DECIDED = 'DISPUTE_DECIDED';
    case PAYOUT_RELEASED = 'PAYOUT_RELEASED';
    case LISTING_WENT_LIVE = 'LISTING_WENT_LIVE';
    case CAPTURE_FAILED = 'CAPTURE_FAILED';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $kind): string => $kind->value, self::cases());
    }

    /**
     * Closed-vocabulary parsing at the service boundary. A consumer replaying an
     * outbox event may carry a kind this deployment does not know; that is a
     * refusal with a clear message, not a silently ignored event.
     */
    public static function parse(string $value): self
    {
        foreach (self::cases() as $case) {
            if ($case->value === $value) {
                return $case;
            }
        }

        throw new NotificationRefused(sprintf(
            'Unknown notification kind "%s"; the vocabulary is %s',
            $value,
            implode(', ', self::values()),
        ));
    }

    public function source(): SourceModule
    {
        return match ($this) {
            self::MESSAGE_RECEIVED => SourceModule::MESSAGING,
            self::ORDER_PLACED, self::ORDER_COMPLETED => SourceModule::ORDERS,
            self::DISPUTE_OPENED, self::DISPUTE_DECIDED => SourceModule::DISPUTES,
            self::PAYOUT_RELEASED => SourceModule::SETTLEMENTS,
            self::LISTING_WENT_LIVE => SourceModule::LISTINGS,
            self::CAPTURE_FAILED => SourceModule::CAPTURE,
        };
    }

    public function subjectType(): string
    {
        return match ($this) {
            self::MESSAGE_RECEIVED => 'thread',
            self::ORDER_PLACED, self::ORDER_COMPLETED => 'order',
            self::DISPUTE_OPENED, self::DISPUTE_DECIDED => 'dispute',
            self::PAYOUT_RELEASED => 'payout',
            self::LISTING_WENT_LIVE => 'listing',
            self::CAPTURE_FAILED => 'capture',
        };
    }
}
