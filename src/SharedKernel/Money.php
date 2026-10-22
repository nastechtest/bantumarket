<?php

declare(strict_types=1);

namespace NasTech\SharedKernel;

/**
 * Money is a value object over integer cents. Never a float.
 *
 * This exists because the ledger has to reconcile to the settlement file to the
 * cent, and float accumulation is how a marketplace silently loses money.
 */
final class Money
{
    private const SUPPORTED_CURRENCY = 'ZAR';

    private function __construct(
        public readonly int $cents,
        public readonly string $currency,
    ) {
    }

    public static function zero(string $currency = self::SUPPORTED_CURRENCY): self
    {
        return new self(0, $currency);
    }

    public static function fromCents(int $cents, string $currency = self::SUPPORTED_CURRENCY): self
    {
        return new self($cents, $currency);
    }

    /**
     * @param numeric-string $rand decimal rand string, e.g. "1299.00"
     */
    public static function fromRand(string $rand): self
    {
        if (!preg_match('/^-?\d+(\.\d{1,2})?$/', $rand)) {
            throw new \InvalidArgumentException("Unparseable rand amount: {$rand}");
        }
        $negative = str_starts_with($rand, '-');
        $abs = ltrim($rand, '-');
        [$whole, $frac] = array_pad(explode('.', $abs, 2), 2, '');
        $frac = str_pad(substr($frac, 0, 2), 2, '0');
        $cents = ((int) $whole) * 100 + (int) $frac;

        return new self($negative ? -$cents : $cents, self::SUPPORTED_CURRENCY);
    }

    public function add(self $other): self
    {
        $this->assertSameCurrency($other);

        return new self($this->cents + $other->cents, $this->currency);
    }

    public function subtract(self $other): self
    {
        $this->assertSameCurrency($other);

        return new self($this->cents - $other->cents, $this->currency);
    }

    public function negate(): self
    {
        return new self(-$this->cents, $this->currency);
    }

    /**
     * Multiply by a rational rate and round half-up to the cent. Deterministic:
     * the same inputs always produce the same commission, which is what makes a
     * replayed webhook unable to invent money.
     */
    public function multiplyRate(float $rate): self
    {
        if (!is_finite($rate)) {
            throw new \InvalidArgumentException('Rate must be finite');
        }
        $product = (float) $this->cents * $rate;

        return new self(self::roundHalfUp($product), $this->currency);
    }

    public function isZero(): bool
    {
        return $this->cents === 0;
    }

    public function isPositive(): bool
    {
        return $this->cents > 0;
    }

    public function isNegative(): bool
    {
        return $this->cents < 0;
    }

    public function gte(self $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->cents >= $other->cents;
    }

    public function gt(self $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->cents > $other->cents;
    }

    public function lt(self $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->cents < $other->cents;
    }

    public function equals(self $other): bool
    {
        return $this->cents === $other->cents && $this->currency === $other->currency;
    }

    public function toRandString(): string
    {
        $sign = $this->cents < 0 ? '-' : '';
        $abs = abs($this->cents);

        return sprintf('%s%s.%02d', $sign, number_format((int) floor($abs / 100), 0, '', ' '), $abs % 100);
    }

    private function assertSameCurrency(self $other): void
    {
        if ($this->currency !== $other->currency) {
            throw new \DomainException("Currency mismatch: {$this->currency} vs {$other->currency}");
        }
    }

    private static function roundHalfUp(float $value): int
    {
        return (int) floor($value + 0.5);
    }
}
