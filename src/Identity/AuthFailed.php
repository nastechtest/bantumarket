<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * The uniform failure at the authentication edge.
 *
 * Every rejected sign-in path throws this with the same message — unknown
 * phone, wrong password, locked credential, erased account. If the responses
 * differ, the login form is a free account-enumeration oracle, and the phone
 * is the account. The message is deliberately the one string all those
 * branches share; the *reason* belongs in the log (via the audit trail and the
 * committed attempt counters), not in the response.
 *
 * Indistinguishability is proven by tests/Identity/IndistinguishableResponsesTest.php.
 */
final class AuthFailed extends \DomainException
{
    public static function badCredentials(): self
    {
        return new self('Phone number or password is not valid.');
    }

    public static function invalidOtp(): self
    {
        return new self('This code is not valid.');
    }

    public static function invalidSession(): self
    {
        return new self('This session is no longer valid.');
    }
}
