<?php

declare(strict_types=1);

namespace NasTech\Audit;

/**
 * The deny-list that keeps the audit log from becoming a second, undocumented
 * store of exactly the data it is meant to make accountable.
 *
 * A before/after diff is the most tempting place to put a card number: it is
 * "just the changed fields". It is also the one place nobody expects to be
 * subpoenaed. The guard therefore refuses rather than redacts — a redacted audit
 * row looks complete and is not, while a refusal tells the caller to record the
 * id and digest instead.
 *
 * Two checks, because either alone is porous:
 *   - every object key is compared, normalised, against the deny-list;
 *   - every string value is tested for the shape of a PAN or a bearer/JWT-style
 *     token, so an innocuous key cannot smuggle one through.
 */
final class SecretGuard
{
    /**
     * Field names, lower-cased with punctuation removed. Exact match on the
     * normalised key: substring matching would reject `token_count` and train
     * people to rename the field instead of removing the secret.
     *
     * @var list<string>
     */
    public const DENY_FIELDS = [
        'authorization',
        'cookie',
        'setcookie',
        'secret',
        'password',
        'passwordhash',
        'passphrase',
        'credential',
        'credentials',
        'token',
        'accesstoken',
        'refreshtoken',
        'idtoken',
        'sessiontoken',
        'authtoken',
        'bearertoken',
        'apikey',
        'apisecret',
        'clientsecret',
        'otp',
        'otpcode',
        'onetimecode',
        'onetimepin',
        'onetimepassword',
        'totp',
        'hotp',
        'verificationcode',
        'smscode',
        'pin',
        'handoverpin',
        'pan',
        'primaryaccountnumber',
        'card',
        'carddata',
        'cardnumber',
        'cardno',
        'creditcard',
        'creditcardnumber',
        'cardholder',
        'cardholdername',
        'cardexpiry',
        'expiry',
        'expirymonth',
        'expiryyear',
        'cvv',
        'cvv2',
        'cvc',
        'cvc2',
        'securitycode',
        'bankaccount',
        'bankaccountnumber',
        'accountnumber',
        'iban',
        'bban',
        'routingnumber',
        'sortcode',
        'swift',
        'bic',
        'survivor',
        'survivorname',
        'survivorid',
        'survivordetails',
        'survivorcontact',
        'survivornumber',
        'nextofkin',
    ];

    /**
     * @param array<string,mixed>|null $before
     * @param array<string,mixed>|null $after
     */
    public static function assertClean(?array $before, ?array $after, ?string $reason = null): void
    {
        if ($before !== null) {
            self::scan($before, '');
        }
        if ($after !== null) {
            self::scan($after, '');
        }
        if ($reason !== null) {
            self::assertValueIsNotSecret('reason', $reason);
        }
    }

    public static function isDeniedFieldName(string $field): bool
    {
        return in_array(self::normaliseKey($field), self::DENY_FIELDS, true);
    }

    /**
     * @param array<array-key,mixed> $payload
     */
    private static function scan(array $payload, string $prefix): void
    {
        foreach ($payload as $key => $value) {
            $name = (string) $key;
            $path = $prefix === '' ? $name : $prefix . '.' . $name;

            if (is_int($key) === false && self::isDeniedFieldName($name)) {
                throw new AuditRefused(sprintf(
                    'Audit payload field "%s" is on the secret deny-list; card, OTP, token, '
                    . 'bank-account and survivor data are never stored. Record an id and digest instead.',
                    $path,
                ));
            }

            if (is_array($value)) {
                self::scan($value, $path);
                continue;
            }

            if (is_string($value)) {
                self::assertValueIsNotSecret($path, $value);
            }
        }
    }

    private static function assertValueIsNotSecret(string $path, string $value): void
    {
        if (self::looksLikePan($value)) {
            throw new AuditRefused(sprintf(
                'Audit payload field "%s" has a value shaped like a card number; card data is never stored.',
                $path,
            ));
        }

        if (self::looksLikeToken($value)) {
            throw new AuditRefused(sprintf(
                'Audit payload field "%s" has a value shaped like a token; credentials are never stored.',
                $path,
            ));
        }
    }

    private static function normaliseKey(string $key): string
    {
        return preg_replace('/[^a-z0-9]/', '', strtolower($key)) ?? '';
    }

    /**
     * A PAN is 13–19 digits, optionally grouped with spaces or hyphens. The Luhn
     * check is what keeps a long numeric id from being mistaken for a card while
     * still catching the test numbers every payment guide uses.
     */
    private static function looksLikePan(string $value): bool
    {
        if (preg_match_all('/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/', $value, $matches) === false) {
            return false;
        }

        foreach ($matches[0] as $candidate) {
            $digits = preg_replace('/\D/', '', $candidate) ?? '';
            $length = strlen($digits);
            if ($length < 13 || $length > 19) {
                continue;
            }
            if (self::passesLuhn($digits)) {
                return true;
            }
        }

        return false;
    }

    private static function passesLuhn(string $digits): bool
    {
        $sum = 0;
        $double = false;
        for ($i = strlen($digits) - 1; $i >= 0; $i--) {
            $digit = (int) $digits[$i];
            if ($double) {
                $digit *= 2;
                if ($digit > 9) {
                    $digit -= 9;
                }
            }
            $sum += $digit;
            $double = !$double;
        }

        return $sum % 10 === 0;
    }

    /**
     * Bearer headers, JWTs and the prefixed keys payment/identity providers issue.
     * A UUID id is not a token; neither is a sha256 digest, which is why neither
     * a bare hex string nor a dash-separated id is on this list.
     */
    private static function looksLikeToken(string $value): bool
    {
        if (preg_match('/\bBearer\s+[A-Za-z0-9._~+\/=-]{8,}/i', $value) === 1) {
            return true;
        }

        if (preg_match('/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/', $value) === 1) {
            return true;
        }

        return preg_match('/\b(?:sk|pk|tok|sess|ghp|xox[bap])_[A-Za-z0-9_-]{8,}/i', $value) === 1;
    }
}
