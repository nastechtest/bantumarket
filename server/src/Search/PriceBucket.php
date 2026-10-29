<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * The price-bucket ladder, transcribed from `PRICE_BUCKETS` in the search
 * contract (currently mirrored in apps/web-public analytics pii-guards.ts; the
 * contracts package is the intended home).
 *
 * Edges are cents and each upper bound is EXCLUSIVE: 50 000 belongs to
 * `500_1000`, not `under_500`, which is exactly `bucketPrice()`'s
 * `findIndex((edge) => cents < edge)` rule. An inclusive upper bound would put
 * a R500 item in the "under R500" facet and a R10 000 item in "R5 000-R10 000",
 * which is the kind of off-by-one a buyer notices and a report never does.
 *
 * `over_10000` is intentionally unbounded above.
 */
enum PriceBucket: string
{
    case Under500 = 'under_500';
    case From500To1000 = '500_1000';
    case From1000To2000 = '1000_2000';
    case From2000To2700 = '2000_2700';
    case From2700To5000 = '2700_5000';
    case From5000To10000 = '5000_10000';
    case Over10000 = 'over_10000';

    /**
     * `PRICE_BUCKET_EDGES_CENTS`, in cents. The order is the ladder's order.
     *
     * @var list<int>
     */
    public const EDGES_CENTS = [50_000, 100_000, 200_000, 270_000, 500_000, 1_000_000];

    public function lowerCents(): int
    {
        return match ($this) {
            self::Under500 => 0,
            self::From500To1000 => 50_000,
            self::From1000To2000 => 100_000,
            self::From2000To2700 => 200_000,
            self::From2700To5000 => 270_000,
            self::From5000To10000 => 500_000,
            self::Over10000 => 1_000_000,
        };
    }

    /**
     * NULL means "no upper bound", not "unknown".
     */
    public function upperCents(): ?int
    {
        return match ($this) {
            self::Under500 => 50_000,
            self::From500To1000 => 100_000,
            self::From1000To2000 => 200_000,
            self::From2000To2700 => 270_000,
            self::From2700To5000 => 500_000,
            self::From5000To10000 => 1_000_000,
            self::Over10000 => null,
        };
    }

    public function contains(int $cents): bool
    {
        $upper = $this->upperCents();

        return $cents >= $this->lowerCents() && ($upper === null || $cents < $upper);
    }

    /**
     * The same choice `bucketPrice()` makes: the first edge the price is below.
     */
    public static function fromCents(int $cents): self
    {
        foreach (self::cases() as $bucket) {
            if ($bucket->contains($cents)) {
                return $bucket;
            }
        }

        throw new \InvalidArgumentException("No price bucket covers a negative price: {$cents}");
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
