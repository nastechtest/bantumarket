<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * The raw answers a listing supplies, keyed by attribute code.
 *
 * The bag deliberately does no interpretation. Its only job is to preserve the
 * caller's keys and values until a category version validates them, so a value
 * is never quietly converted on the way in.
 */
final class AttributeBag
{
    /**
     * @param array<string,mixed> $answers
     */
    private function __construct(private readonly array $answers)
    {
    }

    /**
     * @param array<array-key,mixed> $answers
     */
    public static function fromArray(array $answers): self
    {
        $normalised = [];
        foreach ($answers as $key => $value) {
            if (!is_string($key)) {
                throw new InvalidAttributeValue((string) $key, 'attribute codes are strings, not numeric keys');
            }
            $normalised[$key] = $value;
        }

        return new self($normalised);
    }

    public function has(string $code): bool
    {
        return array_key_exists($code, $this->answers);
    }

    public function value(string $code): mixed
    {
        return $this->answers[$code] ?? null;
    }

    /**
     * @return array<string,mixed>
     */
    public function all(): array
    {
        return $this->answers;
    }

    /**
     * @return list<string>
     */
    public function codes(): array
    {
        return array_keys($this->answers);
    }
}
