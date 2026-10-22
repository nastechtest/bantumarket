import { describe, expect, test } from 'bun:test';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createModelLoader, type ModelLoaderEvent } from '../model-loader.js';

const GLB_BYTES = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3, 4]);

function responseFor(bytes: Uint8Array, { deferMs = 0 }: { deferMs?: number } = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  void deferMs;
  return new Response(body, {
    status: 200,
    headers: { 'content-length': String(bytes.byteLength) },
  });
}

function fakeFetch(impl: (url: string, init?: { signal?: AbortSignal }) => Promise<Response> | Response) {
  const calls: string[] = [];
  const fn = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    return impl(String(url), init as { signal?: AbortSignal } | undefined);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const gltfMarker = (tag: string) => ({ scene: { name: tag } }) as unknown as GLTF;

describe('model-loader', () => {
  test('the cache is keyed by sha256: the SAME hash with a DIFFERENT (re-signed) URL never re-fetches', async () => {
    let fetched = 0;
    const loader = createModelLoader({
      fetchImpl: () => {
        fetched++;
        return Promise.resolve(responseFor(GLB_BYTES));
      },
      parse: async () => gltfMarker('a'),
    });

    const first = await loader.load({ url: 'https://cdn.test/signed/AAA?token=1', sha256: 'deadbeef' }).promise;
    const second = await loader.load({ url: 'https://cdn.test/signed/BBB?token=2', sha256: 'deadbeef' }).promise;

    expect(fetched).toBe(1);
    expect(second).toBe(first); // same parsed GLTF object: real reuse, not a re-parse
    expect(loader.cachedHashes()).toEqual(['deadbeef']);
  });

  test('different hashes fetch independently even when the URLs are identical', async () => {
    const { fn, calls } = fakeFetch(() => Promise.resolve(responseFor(GLB_BYTES)));
    const loader = createModelLoader({ fetchImpl: fn, parse: async () => gltfMarker('x') });
    await loader.load({ url: 'https://cdn.test/same', sha256: 'hash-1' }).promise;
    await loader.load({ url: 'https://cdn.test/same', sha256: 'hash-2' }).promise;
    expect(calls).toHaveLength(2);
    expect(loader.cachedHashes()).toEqual(['hash-1', 'hash-2']);
  });

  test('no signed URL ever reaches a log line — URLs are fetch input only', async () => {
    const events: ModelLoaderEvent[] = [];
    const loader = createModelLoader({
      fetchImpl: () => Promise.resolve(responseFor(GLB_BYTES)),
      parse: async () => gltfMarker('x'),
      log: (e) => events.push(e),
    });
    await loader.load({ url: 'https://cdn.test/private/bucketKey?sig=SECRET', sha256: 'abc123' }).promise;
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('cdn.test');
    expect(serialized).not.toContain('SECRET');
    expect(serialized).not.toContain('bucketKey');
    expect(events.map((e) => e.kind)).toEqual(['fetch-start', 'fetched', 'parsed']);
    expect(events[0]?.sha256).toBe('abc123');
  });

  test('fetch failures are reported with the hash, never the URL, and evict the cache entry', async () => {
    const loader = createModelLoader({
      fetchImpl: () => Promise.resolve(new Response('nope', { status: 403 })),
      parse: async () => gltfMarker('x'),
    });
    let message = '';
    try {
      await loader.load({ url: 'https://cdn.test/secret-path?sig=S', sha256: 'ff00' }).promise;
    } catch (error) {
      message = String((error as Error).message);
    }
    expect(message).toContain('ff00');
    expect(message).not.toContain('cdn.test');
    expect(message).not.toContain('secret-path');
    expect(message).not.toContain('S?');
    expect(loader.peek('ff00')).toBeUndefined(); // a failed entry must not linger
  });

  test('abort mid-flight rejects the promise, evicts the entry, and the next load re-fetches', async () => {
    let fetched = 0;
    const loader = createModelLoader({
      fetchImpl: (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          fetched++;
          const signal = init?.signal;
          const timer = setTimeout(() => resolve(responseFor(GLB_BYTES)), 5_000);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('signal aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
      parse: async () => gltfMarker('x'),
    });

    const handle = loader.load({ url: 'https://cdn.test/slow?sig=S', sha256: 'slowhash' });
    expect(loader.peek('slowhash')).toBeDefined(); // in-flight promises are shared under the key
    handle.abort('navigated-away');

    let name = '';
    try {
      await handle.promise;
    } catch (error) {
      name = (error as Error).name;
    }
    expect(name).toBe('AbortError');
    expect(loader.peek('slowhash')).toBeUndefined();
    expect(fetched).toBe(1);
    void loader.load({ url: 'https://cdn.test/slow2', sha256: 'slowhash' });
    expect(fetched).toBe(2); // re-fetch, not a poisoned promise
  });

  test('progress callbacks see streamed byte deltas with the declared total', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });
    const response = new Response(stream, { status: 200, headers: { 'content-length': '10' } });
    const loader = createModelLoader({
      fetchImpl: () => Promise.resolve(response),
      parse: async () => gltfMarker('x'),
    });
    const seen: Array<{ loadedBytes: number; totalBytes: number | null }> = [];
    await loader.load({ url: 'https://cdn.test/p', sha256: 'prog' }, { onProgress: (p) => seen.push(p) }).promise;
    expect(seen).toEqual([
      { loadedBytes: 4, totalBytes: 10 },
      { loadedBytes: 10, totalBytes: 10 },
    ]);
  });

  test('an already-aborted external signal rejects without leaving a cache entry', async () => {
    const loader = createModelLoader({
      fetchImpl: (_url: string | URL | Request, init?: RequestInit) =>
        init?.signal?.aborted
          ? Promise.reject(new DOMException('aborted before start', 'AbortError'))
          : Promise.resolve(responseFor(GLB_BYTES)),
      parse: async () => gltfMarker('x'),
    });
    const controller = new AbortController();
    controller.abort();
    let name = '';
    try {
      await loader.load({ url: 'https://cdn.test/x', sha256: 'pre' }, { signal: controller.signal }).promise;
    } catch (error) {
      name = (error as Error).name;
    }
    // The signal is wired to the fetch controller before the request goes out; a fetch that
    // honours it (every real one does) rejects, and the failed entry is evicted.
    expect(name).toBe('AbortError');
    expect(loader.peek('pre')).toBeUndefined();
  });

  test('invalidate removes exactly the entry named by the hash', async () => {
    const loader = createModelLoader({
      fetchImpl: () => Promise.resolve(responseFor(GLB_BYTES)),
      parse: async () => gltfMarker('x'),
    });
    await loader.load({ url: 'https://cdn.test/a', sha256: 'one' }).promise;
    await loader.load({ url: 'https://cdn.test/b', sha256: 'two' }).promise;
    expect(loader.invalidate('one')).toBe(true);
    expect(loader.invalidate('one')).toBe(false);
    expect(loader.cachedHashes()).toEqual(['two']);
  });
});
