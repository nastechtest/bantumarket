<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * The message body, bounded and normalised once rather than at each call site.
 *
 * No mbstring in this environment, so the bound is in bytes (UTF-8 text is at most
 * 4 bytes per code point; 8 000 bytes is a generous chat message). The value object
 * does not rewrite the text beyond trimming the ends: silently normalising a quote
 * or a phone number would change the evidence a dispute reads.
 */
final class MessageBody
{
    public const MAX_BYTES = 8000;

    private function __construct(public readonly string $text)
    {
    }

    public static function fromText(string $text): self
    {
        $trimmed = trim($text);
        if ($trimmed === '') {
            throw new MessageRefused('A message body cannot be empty or whitespace');
        }
        if (strlen($trimmed) > self::MAX_BYTES) {
            throw new MessageRefused(sprintf(
                'A message body is limited to %d bytes; this one is %d',
                self::MAX_BYTES,
                strlen($trimmed),
            ));
        }
        if (preg_match('//u', $trimmed) !== 1) {
            throw new MessageRefused('A message body must be valid UTF-8');
        }

        return new self($trimmed);
    }

    public static function tombstone(): self
    {
        return new self('');
    }

    public function digest(): string
    {
        return hash('sha256', $this->text);
    }

    public function isDeleted(): bool
    {
        return $this->text === '';
    }
}
