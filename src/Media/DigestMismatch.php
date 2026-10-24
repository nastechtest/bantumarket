<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * The bytes are not the bytes the record named.
 *
 * Thrown by verification, never by hashing: a mismatch is a fact about stored
 * content, and the record that carries it is driven to REJECTED rather than left
 * in a state that reads as almost-right. Nothing whose digest mismatched may ever
 * be published, and the state machine is what makes that structural rather than a
 * check somebody remembers.
 */
final class DigestMismatch extends \DomainException
{
    public static function between(Digest $declared, Digest $observed, string $recordId): self
    {
        return new self(sprintf(
            'Media %s declares sha256 %s but the object at its content address hashes to %s. '
            . 'The two are different content; the record is refused and cannot be published.',
            $recordId,
            $declared->shortDisplay(),
            $observed->shortDisplay(),
        ));
    }
}
