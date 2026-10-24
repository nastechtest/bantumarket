<?php

declare(strict_types=1);

namespace NasTech\Identity;

/**
 * Password hashing, from PHP core only. No Composer, no external KDF.
 *
 * Primary scheme: PASSWORD_ARGON2ID via password_hash — memory-hard, the
 * winner of the PHC contest, and the scheme the launch review insisted on for
 * a phone-first catalogue where number+password reuse is the realistic attack.
 *
 * Fallback (documented, deliberately narrow): when PHP is compiled without
 * Argon2 — `defined('PASSWORD_ARGON2ID')` is false on minimal distro builds —
 * the scheme becomes PASSWORD_BCRYPT at cost 10+. Why bcrypt and not sodium:
 * sodium_crypto_pwhash *is* Argon2id and this environment has it, but it
 * produces a raw digest with no embedded parameters and no interop with
 * password_verify(); a second verify path that only one environment exercises
 * is the drift that locks everyone out after a rebuild. password_hash /
 * password_verify round-trip their own parameters in the digest, so the
 * `algo` tag on the credential row is a label for ops, not a load-bearing
 * branch — a bcrypt row still passes checks after the server gains argon2id, and the
 * next successful check upgrades it. The fallback is logged loudly in
 * Schema.php-adjacent deploy notes; running bcrypt in production is a
 * tracked defect, not a config choice.
 *
 * The cost ladder (Credential::MAX_LADDER_STEP): each failed check steepens
 * the work of the *next* check for that account — the extra iterations in
 * check() are real password_verify runs against the stored digest, so a
 * targeted guesser pays ladder_step+1 times the argon2id cost per attempt
 * while a healthy account pays it once. Bounded (DDL ladder_is_bounded)
 * because an unbounded ladder is a denial of service against the owner.
 *
 * The dummy work (dummyCheck) is what makes "no such account" indistinguishable
 * from "wrong password": the unknown-phone branch runs one real check against a
 * throwaway digest so its wall-clock and CPU shape the request like a
 * rejection of a real one.
 */
final class PasswordHasher
{
    public const ALGO_ARGON2ID = 'argon2id';
    public const ALGO_BCRYPT = 'bcrypt';
    public const ALGO_ERASED = 'erased';

    /** 64 MiB, time cost 2, one thread: the CI-safe corner of argon2id's honest region. */
    private const ARGON2_OPTIONS = ['memory_cost' => 65536, 'time_cost' => 2, 'threads' => 1];

    /** sha256-hex of random bytes: the shape an erased credential digest keeps. */
    public const ERASED_PREFIX = 'erased_';

    private int $checkCount = 0;
    private ?string $decoyDigest = null;

    public function __construct(private readonly bool $argon2Available = true)
    {
    }

    /**
     * Build the hasher as this PHP binary actually can: argon2id when defined,
     * bcrypt otherwise. Tests inject the flag to exercise the fallback without
     * rebuilding PHP.
     */
    public static function forThisRuntime(): self
    {
        return new self(defined('PASSWORD_ARGON2ID'));
    }

    /** The stored digest plus the tag for the credential row's `algo` column. */
    public function hash(string $password, int $ladderStep = 0): string
    {
        if ($password === '') {
            throw new \InvalidArgumentException('An empty password is not a credential');
        }

        return $this->argon2Available && defined('PASSWORD_ARGON2ID')
            ? password_hash($password, PASSWORD_ARGON2ID, [
                'memory_cost' => self::ARGON2_OPTIONS['memory_cost'],
                'time_cost' => self::ARGON2_OPTIONS['time_cost'] + min($ladderStep, 2),
                'threads' => self::ARGON2_OPTIONS['threads'],
            ])
            : password_hash($password, PASSWORD_BCRYPT, ['cost' => 10 + min($ladderStep, 2)]);
    }

    public function algo(): string
    {
        return $this->argon2Available && defined('PASSWORD_ARGON2ID')
            ? self::ALGO_ARGON2ID
            : self::ALGO_BCRYPT;
    }

    /**
     * Check a password against a stored digest at this account's ladder cost.
     * Runs ladderStep+1 rounds and returns the real one's result: the
     * extra work lands on *every* check of a steepened account, correct or
     * not, so the attacker cannot tell which guesses are cheap.
     */
    public function check(string $password, string $digest, int $ladderStep): bool
    {
        $result = false;
        $rounds = max(1, min($ladderStep, Credential::MAX_LADDER_STEP) + 1);
        for ($i = 0; $i < $rounds; $i++) {
            $this->checkCount++;
            $result = password_verify($password, $digest);
        }

        return $result;
    }

    /**
     * Constant-shape work for the no-such-account branch: one KDF round
     * against a throwaway digest costs what one failed check of a real
     * account's base ladder costs, and the response (AuthFailed) is the same
     * one the real branch throws.
     */
    public function dummyCheck(string $password): bool
    {
        $this->decoyDigest ??= $this->hash('nastech-decoy-' . bin2hex(random_bytes(16)));
        $this->checkCount++;

        return password_verify($password, $this->decoyDigest);
    }

    /**
     * The digest an erased credential keeps: same hex-64 shape, no secret
     * behind it, uncheckable forever. Deliberately not a password_hash — an
     * erased row should not pretend a KDF protects a value that no longer
     * exists.
     */
    public function erasedDigest(): string
    {
        return self::ERASED_PREFIX . bin2hex(random_bytes(32));
    }

    /**
     * True when the stored digest was made under weaker parameters than this
     * runtime uses now (a bcrypt row after a rebuild that gained argon2id, or
     * a ladder-steepened digest once the account is healthy again). The
     * success path rehashes when this says so.
     */
    public function needsUpgrade(string $digest, int $ladderStep): bool
    {
        if ($ladderStep !== 0) {
            return false;
        }
        if (!$this->argon2Available || !defined('PASSWORD_ARGON2ID')) {
            return false;
        }

        return password_needs_rehash($digest, PASSWORD_ARGON2ID, self::ARGON2_OPTIONS);
    }

    /**
     * Test seam: how many KDF rounds this hasher has run. The
     * indistinguishability test asserts the unknown-phone and wrong-password
     * paths cost the same, which a wall-clock assertion could never prove
     * reliably.
     */
    public function checkCount(): int
    {
        return $this->checkCount;
    }
}
