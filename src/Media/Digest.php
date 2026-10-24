<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * A sha256, as a type — because the digest *is* the media's identity.
 *
 * Content addressing makes this the one column nothing may be sloppy about: an
 * uppercase spelling of the same bytes would produce a second bucket key, a
 * truncated one would produce a third, and the reconciliation that ADR 0002 buys
 * with PHP-side media ("an asset that cannot be counted cannot be reconciled
 * against the R270 it cost") stops closing. So the type refuses everything except
 * 64 lowercase hex characters, and the only way to build one from bytes is to
 * hash them.
 */
final class Digest
{
    public const PATTERN = '^[0-9a-f]{64}$';

    private function __construct(public readonly string $hex)
    {
    }

    /**
     * The honest constructor: the digest of bytes that exist. Nothing here can
     * claim a digest for content it was not given, which is the failure mode this
     * module is most afraid of — a record that describes an asset nobody produced.
     */
    public static function ofBytes(string $bytes): self
    {
        if ($bytes === '') {
            throw new \InvalidArgumentException(
                'Refusing to digest an empty payload: a zero-byte object is not an asset, '
                . 'and a record for one would publish nothing under a key that exists.'
            );
        }

        return new self(hash('sha256', $bytes));
    }

    /**
     * A digest read back from storage or from a client's declared upload.
     *
     * Uppercase is refused rather than normalised. A declared digest is a promise
     * about specific bytes, and silently re-spelling it would make two different
     * promises look interchangeable when one of them was a copy-paste error.
     */
    public static function fromHex(string $hex): self
    {
        if (preg_match(self::PATTERN, $hex) !== 1) {
            throw new \InvalidArgumentException(sprintf(
                'Not a sha256 hex digest (expected 64 lowercase hex characters): %s',
                self::safe($hex),
            ));
        }

        return new self($hex);
    }

    public function matchesBytes(string $bytes): bool
    {
        return hash_equals($this->hex, hash('sha256', $bytes));
    }

    public function equals(self $other): bool
    {
        return $this->hex === $other->hex;
    }

    /** Two hex characters, for the bucket's fan-out prefixes. */
    public function shardSegment(int $from, int $length): string
    {
        return substr($this->hex, $from, $length);
    }

    /** Safe to put in a log line or an error message: it is not a credential. */
    public function shortDisplay(): string
    {
        return substr($this->hex, 0, 12) . '…';
    }

    public function __toString(): string
    {
        return $this->hex;
    }

    private static function safe(string $candidate): string
    {
        return strlen($candidate) > 80 ? substr($candidate, 0, 80) . '…' : $candidate;
    }
}
