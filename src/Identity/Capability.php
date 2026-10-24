<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * Capability strings and the role that holds them, as data.
 *
 * Authorisation is by capability, checked server-side at the command boundary
 * (see Authorisation), never by a UI hiding a button. The staff/buyer/seller
 * distinction is a role string on identity.accounts — one table, one aggregate
 * — because the same person is a buyer today and a seller next month, and a
 * second table for staff would put "who is staff" in two places that can
 * disagree.
 *
 * What is deliberately NOT here: no role holds every capability, and staff is
 * not a superuser — the map is named so a reviewer can diff a proposed change
 * to `session.impersonate` or `payout.release` against the launch review.
 * A capability that only exists in the front end is a vulnerability; one added
 * to FOR_ROLES without a test naming the failure mode below is the same thing
 * wearing a server.
 */
final class Capability
{
    public const ORDER_PLACE = 'order.place';
    public const LISTING_MANAGE = 'listing.manage';
    public const PAYOUT_REQUEST = 'payout.request';
    public const MESSAGING_SEND = 'messaging.send';

    public const LISTING_REVIEW = 'listing.review';
    public const DISPUTE_DECIDE = 'dispute.decide';
    public const PAYOUT_RELEASE = 'payout.release';
    public const ACCOUNT_SANCTION = 'account.sanction';
    public const CAPTURE_OPERATE = 'capture.operate';
    public const SESSION_IMPERSONATE = 'session.impersonate';
    public const ROLE_ASSIGN = 'role.assign';
    public const TIER_GRANT = 'tier.grant';
    public const SUBJECT_ERASE = 'subject.erase';

    public const ROLE_BUYER = Account::ROLE_BUYER;
    public const ROLE_SELLER = Account::ROLE_SELLER;
    public const ROLE_STAFF = Account::ROLE_STAFF;

    /**
     * role => capabilities. A capability absent from every list is refused
     * everywhere: the map is allow-by-name, not deny-by-list.
     *
     * The buyer's set is what a signed-in private person may do; the seller's
     * is the buyer's plus the selling surface; staff's is the operating
     * surface only — staff place no orders and manage no listings, and if a
     * flow ever needs that, the answer is a second account, not a widened
     * staff row.
     *
     * @var array<string, list<string>>
     */
    public const FOR_ROLES = [
        Account::ROLE_BUYER => [
            self::ORDER_PLACE,
            self::MESSAGING_SEND,
        ],
        Account::ROLE_SELLER => [
            self::ORDER_PLACE,
            self::MESSAGING_SEND,
            self::LISTING_MANAGE,
            self::PAYOUT_REQUEST,
        ],
        Account::ROLE_STAFF => [
            self::LISTING_REVIEW,
            self::DISPUTE_DECIDE,
            self::PAYOUT_RELEASE,
            self::ACCOUNT_SANCTION,
            self::CAPTURE_OPERATE,
            self::SESSION_IMPERSONATE,
            self::ROLE_ASSIGN,
            self::TIER_GRANT,
            self::SUBJECT_ERASE,
        ],
    ];

    /**
     * Every capability string known to the module, sorted — the vocabulary the
     * DDL enumerations and the tests compare against.
     *
     * @return list<string>
     */
    public static function all(): array
    {
        $all = [];
        foreach (self::FOR_ROLES as $capabilities) {
            foreach ($capabilities as $capability) {
                $all[$capability] = true;
            }
        }
        $ordered = array_keys($all);
        sort($ordered);

        return $ordered;
    }

    /**
     * @return list<string>
     */
    public static function forRole(string $role): array
    {
        return self::FOR_ROLES[$role] ?? [];
    }
}
