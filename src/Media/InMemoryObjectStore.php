<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * In-memory ObjectStore.
 *
 * There is no bucket and no network in this environment, so this is the store the
 * tests and the wiring run against. It models the two properties that matter for
 * correctness — immutability of a key, and an identical re-put being a no-op — and
 * nothing else: no multipart resume, no lifecycle rules, no versioning. Those are
 * the adapter's problem when a real transport exists.
 *
 * Bytes are held in memory, which is fine for test fixtures and is exactly why this
 * class is not the production path.
 */
final class InMemoryObjectStore implements ObjectStore
{
    /** @var array<string, array{bytes: string, mime: string}> */
    private array $objects = [];

    /** @var list<string> keys removed, for the retention tests that assert a byte count */
    private array $removed = [];

    public function put(StorageKey $key, string $bytes, string $mime): void
    {
        $existing = $this->objects[$key->value] ?? null;

        if ($existing === null) {
            $this->objects[$key->value] = ['bytes' => $bytes, 'mime' => $mime];

            return;
        }

        // Same content, same key: the resumed-upload case. It succeeds without
        // writing anything, so a retry after a timeout is a no-op rather than a
        // conflict — which is the whole reason the key is derived from the digest.
        if ($existing['bytes'] === $bytes) {
            return;
        }

        throw ObjectStoreConflict::differentBytes($key, $existing['mime'], $mime);
    }

    public function read(StorageKey $key): ?string
    {
        return $this->objects[$key->value]['bytes'] ?? null;
    }

    public function exists(StorageKey $key): bool
    {
        return isset($this->objects[$key->value]);
    }

    public function remove(StorageKey $key): void
    {
        if (!isset($this->objects[$key->value])) {
            return;
        }
        unset($this->objects[$key->value]);
        $this->removed[] = $key->value;
    }

    public function objectCount(): int
    {
        return count($this->objects);
    }

    /** @return list<string> */
    public function removedKeys(): array
    {
        return $this->removed;
    }

    /**
     * Test seam: shorten an object as an interrupted upload would have left it,
     * bypassing the immutability rule above.
     *
     * It exists so the digest-mismatch path can be reached from real stored bytes
     * rather than from a hand-written row — the same kind of seam as
     * InMemoryUnitOfWork::failNextCommit(), which proves a rollback that no
     * application-level call could otherwise cause. Nothing in src/ calls this.
     */
    public function truncateObjectForTest(StorageKey $key, int $keepBytes): void
    {
        $existing = $this->objects[$key->value] ?? null;
        if ($existing === null) {
            throw new \LogicException('truncateObjectForTest() needs an object to corrupt');
        }

        $this->objects[$key->value] = [
            'bytes' => substr($existing['bytes'], 0, $keepBytes),
            'mime' => $existing['mime'],
        ];
    }
}
