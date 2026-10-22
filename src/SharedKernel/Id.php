<?php

declare(strict_types=1);

namespace NasTech\SharedKernel;

/**
 * Identifier generation. v1.0 §14 says every entity has a UUID; the reason to
 * make it a type rather than a string is that a payment id passing as an order
 * id is exactly the class of bug the ledger cannot survive.
 */
final class Id
{
    private function __construct(private readonly string $value)
    {
    }

    public static function generate(string $prefix = ''): self
    {
        $bytes = random_bytes(16);
        // Set version 4 and variant bits, then hex — no uuid library available.
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        $uuid = sprintf('%s-%s-%s-%s-%s',
            substr($hex, 0, 8), substr($hex, 8, 4), substr($hex, 12, 4),
            substr($hex, 16, 4), substr($hex, 20, 12));

        return new self($prefix === '' ? $uuid : $prefix . '_' . $uuid);
    }

    public static function fromString(string $value): self
    {
        if ($value === '' || !preg_match('/^[A-Za-z0-9_\-]{1,64}$/', $value)) {
            throw new \InvalidArgumentException('Unusable identifier');
        }

        return new self($value);
    }

    public function value(): string
    {
        return $this->value;
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
