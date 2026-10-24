<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * The content-addressed store refused: the key already holds other bytes.
 *
 * This is not a retryable error and not a duplicate. A duplicate write of the same
 * bytes is normal (a resumed upload) and succeeds quietly; a write of *different*
 * bytes under an address that already names a digest means someone is pointing a
 * trusted key at new content, which is the attack the whole module is shaped around.
 */
final class ObjectStoreConflict extends \RuntimeException
{
    public static function differentBytes(StorageKey $key, string $existingMime, string $proposedMime): self
    {
        return new self(sprintf(
            'The object at %s already holds %s content and will not be replaced by %s content. '
            . 'A content address names one set of bytes forever; new bytes are a new address.',
            $key->value,
            $existingMime,
            $proposedMime,
        ));
    }
}
