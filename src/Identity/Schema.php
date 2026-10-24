<?php

declare(strict_types=1);

namespace NasTech\Identity;

use NasTech\SharedKernel\Persistence\InMemoryStore;

/**
 * The constraints Identity depends on, declared in one place — the module's
 * copy of the pattern in SharedKernel\Persistence\Schema.
 *
 * The migration (db/migrations/005_identity.sql) applies the same lists as DDL,
 * and tests/Identity/IdentityDdlTest.php proves the two agree in both
 * directions: a constraint absent here is a constraint the PHP will not
 * enforce, and a constraint named here but not in the migration is one
 * production will not enforce.
 *
 * What the append-only pair buys: impersonation_log and erasure_records are the
 * evidence a POPIA complaint or an insider investigation is answered with. If
 * the row that records an impersonation could be edited, the bound on
 * impersonation would be a policy promise with no proof behind it.
 */
final class Schema
{
    /**
     * @var array<string, string> bare table => "schema.table"
     */
    public const TABLES = [
        'accounts' => 'identity.accounts',
        'credentials' => 'identity.credentials',
        'otp_challenges' => 'identity.otp_challenges',
        'sessions' => 'identity.sessions',
        'contact_channels' => 'identity.contact_channels',
        'address_book' => 'identity.address_book',
        'impersonation_log' => 'identity.impersonation_log',
        'erasure_records' => 'identity.erasure_records',
    ];

    /**
     * @var list<string>
     */
    public const APPEND_ONLY_TABLES = [
        'impersonation_log',
        'erasure_records',
    ];

    /**
     * Idempotency and one-live-row rules, by unique index rather than by
     * check-then-write: a pre-check has a window, an index does not. The
     * nullable columns here (active_claim_key, default_claim_key) carry the
     * "one live row" semantics because Postgres — and InMemoryStore — treat
     * NULLs as distinct in a unique index.
     *
     * @var array<string, list<string>>
     */
    public const UNIQUE_INDEXES = [
        'accounts' => ['phone_e164'],
        'credentials' => ['account_id'],
        'otp_challenges' => ['active_claim_key'],
        'sessions' => ['token_hash'],
        'contact_channels' => ['type+target'],
        'address_book' => ['default_claim_key'],
    ];

    /**
     * The named row rules, by PostgreSQL name — the decisions, not the column
     * hygiene. Mirrors the named CONSTRAINTs in 005_identity.sql.
     *
     * @var array<string, list<string>>
     */
    public const ROW_CHECKS = [
        'identity.accounts' => [
            'account_role_is_known',
            'account_status_is_known',
            'tier_value_is_from_the_contract',
            'tier_grant_is_a_record_not_a_guess',
            'phone_is_e164_or_anonymised',
        ],
        'identity.credentials' => [
            'credential_algo_is_known',
            'attempts_lock_out_at_eight',
            'ladder_is_bounded',
            'credential_hash_is_never_short',
        ],
        'identity.otp_challenges' => [
            'otp_scope_is_known',
            'otp_digest_is_a_hash',
            'otp_attempts_lock_out_at_five',
            'otp_pending_needs_claim_key',
        ],
        'identity.sessions' => [
            'session_token_is_a_digest',
            'session_ip_is_a_hash',
            'impersonation_states_its_purpose',
        ],
        'identity.contact_channels' => [
            'channel_type_is_known',
            'phone_channel_is_e164_or_anonymised',
        ],
        'identity.address_book' => [
            'address_recipient_is_present_when_named',
            'postal_code_is_four_digits',
            'province_code_is_two_letters',
        ],
        'identity.impersonation_log' => [
            'impersonation_kind_is_known',
            'impersonation_reason_is_mandatory',
            'impersonation_end_references_start',
            'impersonation_start_has_no_parent',
        ],
        'identity.erasure_records' => [
            'erasure_reason_is_mandatory',
        ],
    ];

    public static function apply(InMemoryStore $store): void
    {
        $store->enforceAppendOnly(self::APPEND_ONLY_TABLES);
        $store->enforceUnique(self::UNIQUE_INDEXES);
    }
}
