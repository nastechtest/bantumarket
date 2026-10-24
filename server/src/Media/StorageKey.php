<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * The object's address in the bucket, as a pure function of its content.
 *
 * There is deliberately no way to supply a key. A caller chooses a key and the
 * record is then a pointer to whatever was put there — which is how a listing ends
 * up displaying a watch that was never in the studio. Deriving it from the digest
 * means the key can only ever name the bytes it claims to name, and it makes the
 * retry-after-timeout case fall out of the arithmetic: the second attempt asks for
 * the same key, is told the object is already there, and the row it wanted is the
 * row that exists.
 *
 * Keyed on the digest alone, not on (digest, rendition kind, lod tier): identical
 * bytes are one object no matter which record points at them, so the bucket holds
 * what was paid for once. The triple is unique on the *record*, in the DDL, which
 * is where a duplicate would be a bug.
 */
final class StorageKey
{
    public const PREFIX = 'private/cas';

    public const PATTERN = '#^private/cas/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{64}$#';

    private function __construct(public readonly string $value)
    {
    }

    public static function forContent(Digest $digest): self
    {
        return new self(sprintf(
            '%s/%s/%s/%s',
            self::PREFIX,
            $digest->shardSegment(0, 2),
            $digest->shardSegment(2, 2),
            $digest->hex,
        ));
    }

    /**
     * A key that arrived from storage. Checked against the digest it is supposed
     * to describe by MediaRecord::fromRow(), so a row whose key was edited by hand
     * fails on load rather than serving different bytes under a trusted address.
     */
    public static function fromStored(string $value): self
    {
        if (preg_match(self::PATTERN, $value) !== 1) {
            throw new MediaRefused(sprintf(
                'Stored storage_key is not a content address: %s',
                strlen($value) > 96 ? substr($value, 0, 96) . '…' : $value,
            ));
        }

        return new self($value);
    }

    public function equals(self $other): bool
    {
        return $this->value === $other->value;
    }

    public function __toString(): string
    {
        return $this->value;
    }
}
