<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * The answers a category version accepted, in canonical order.
 *
 * `digest()` is the answers digest a pin carries. It is computed over the frozen
 * binding set (the map is keyed by attribute code and sorted), so a dispute can
 * recompute the same value from the same claims without storing the answers in
 * this module. The "answers:" prefix makes it structurally different from the
 * vocabulary digest, which the DDL also requires.
 */
final class ValidatedAttributes
{
    /**
     * @param array<string,int|string|bool> $answers
     */
    private function __construct(private readonly array $answers)
    {
    }

    /**
     * @param array<string,int|string|bool> $answers
     */
    public static function canonicalise(array $answers): self
    {
        ksort($answers, SORT_STRING);

        return new self($answers);
    }

    /**
     * @return array<string,int|string|bool>
     */
    public function all(): array
    {
        return $this->answers;
    }

    /**
     * @return array<string,int|string|bool>
     */
    public function toArray(): array
    {
        return $this->answers;
    }

    public function digest(): string
    {
        return hash('sha256', 'answers:' . json_encode(
            $this->answers,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
        ));
    }
}
