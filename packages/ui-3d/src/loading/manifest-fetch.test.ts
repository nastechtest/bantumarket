import { describe, expect, it } from 'bun:test';
import type { AssetManifest } from '@nastech/api-contracts';
import {
  ManifestFetchError,
  createManifestCache,
  createSignedUrlCache,
  fetchManifest,
  loadStaticPathManifest,
  requestSignedUrl,
  type Transport,
  type TransportResponse,
} from './manifest-fetch.js';

function manifestFor(listingId: string, version: number, signedUrl: string): AssetManifest {
  return {
    assetId: `ast_${version}`,
    listingId,
    version,
    checksum: 'sha256:dev',
    claimScope: 'geometry_and_external_condition',
    metricScaleMetersPerUnit: 0.0405,
    poster: {
      id: 'ren_poster',
      kind: 'POSTER',
      lod: 'poster',
      bytes: 118_000,
      sha256: 'dev',
      bucketKey: 'private',
      mime: 'image/jpeg',
      signedUrl,
    } as never,
    renditions: [],
    captions: [],
  };
}

function response(status: number, body: unknown): TransportResponse {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

const noWait = async () => {};

/**
 * A fetch that resolves where the test expects a failure is a failing test, not a `null` error, so the
 * helper asserts the rejection instead of casting it away.
 */
async function failure(run: Promise<unknown>): Promise<ManifestFetchError> {
  return run.then(
    () => {
      throw new Error('Expected the fetch to fail, but it resolved.');
    },
    (e: unknown) => e as ManifestFetchError,
  );
}

describe('fetchManifest', () => {
  it('serves a second request for the same listing and version without touching the network', async () => {
    let calls = 0;
    const transport: Transport = async () => {
      calls += 1;
      return response(200, manifestFor('lst_01', 3, '/signed/fresh'));
    };
    const cache = createManifestCache();
    const first = await fetchManifest('lst_01', { version: 3, transport, cache, sleep: noWait });
    const second = await fetchManifest('lst_01', { version: 3, transport, cache, sleep: noWait });
    expect(calls).toBe(1);
    expect(second.listingId).toBe(first.listingId);
  });

  it('keys the cache by listing and version, so a re-cut asset cannot be served from the old one', async () => {
    let calls = 0;
    const transport: Transport = async (url) => {
      calls += 1;
      const version = url.includes('version=4') ? 4 : 3;
      return response(200, manifestFor('lst_01', version, `/signed/v${version}`));
    };
    const cache = createManifestCache();
    await fetchManifest('lst_01', { version: 3, transport, cache, sleep: noWait });
    const v4 = await fetchManifest('lst_01', { version: 4, transport, cache, sleep: noWait });
    expect(calls).toBe(2);
    expect(v4.version).toBe(4);
    expect(cache.size).toBe(2);
  });

  it('never caches a signed URL, because a cached permission slip outlives its authority', async () => {
    const cache = createManifestCache();
    await fetchManifest('lst_01', { version: 3, transport: async () => response(200, manifestFor('lst_01', 3, '/signed/ttl')), cache, sleep: noWait });
    const cached = cache.read('lst_01', 3)!;
    expect((cached.poster as { signedUrl?: string }).signedUrl).toBeUndefined();
    // The live response the caller just got may keep it; what sits in memory may not.
    const fresh = await fetchManifest('lst_01', { version: 99, transport: async () => response(200, manifestFor('lst_01', 99, '/signed/live')), sleep: noWait });
    expect((fresh.poster as { signedUrl?: string }).signedUrl).toBe('/signed/live');
  });

  it('retries a 503 with backoff and succeeds', async () => {
    let calls = 0;
    const delays: number[] = [];
    const transport: Transport = async () => {
      calls += 1;
      if (calls < 3) return response(503, { error: 'unavailable' });
      return response(200, manifestFor('lst_01', 3, '/signed/x'));
    };
    const manifest = await fetchManifest('lst_01', {
      version: 3,
      transport,
      cache: createManifestCache(),
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    expect(manifest.version).toBe(3);
    expect(calls).toBe(3);
    expect(delays).toHaveLength(2);
  });

  it('does not retry a 404 — and fails in a way that hands over the static path', async () => {
    let calls = 0;
    const transport: Transport = async () => {
      calls += 1;
      return response(404, { error: 'not found' });
    };
    const error = await failure(
      fetchManifest('lst_missing', { version: 1, transport, cache: createManifestCache(), sleep: noWait }),
    );
    expect(error).toBeInstanceOf(ManifestFetchError);
    expect(calls).toBe(1);
    expect(error.reason).toBe('client-error');
    expect(error.staticPath).toBe(true);
  });

  it('gives up after the retry budget with the static path, not a spinner', async () => {
    let calls = 0;
    const transport: Transport = async () => {
      calls += 1;
      return response(500, { error: 'boom' });
    };
    const error = await failure(
      fetchManifest('lst_01', {
        version: 1,
        transport,
        cache: createManifestCache(),
        sleep: noWait,
        retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, random: () => 1 },
      }),
    );
    expect(calls).toBe(3);
    expect(error.reason).toBe('attempts-exhausted');
    expect(error.staticPath).toBe(true);
  });

  it('stops fetching the moment the caller aborts', async () => {
    const controller = new AbortController();
    let calls = 0;
    const transport: Transport = async (_url, { signal }) => {
      calls += 1;
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
        setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, 50);
      });
      return response(200, manifestFor('lst_01', 3, '/signed/x'));
    };
    const pending = fetchManifest('lst_01', { version: 3, transport, cache: createManifestCache(), sleep: noWait, signal: controller.signal, timeoutMs: 0 });
    controller.abort();
    const error = await failure(pending);
    expect(error).toBeInstanceOf(ManifestFetchError);
    expect(error.reason).toBe('aborted');
    expect(calls).toBe(1);
  });

  it('refuses a hung connection on its own clock', async () => {
    const transport: Transport = (_url, { signal }) =>
      new Promise<TransportResponse>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('timeout', 'AbortError'));
        signal.addEventListener('abort', onAbort, { once: true });
      });
    const error = await failure(
      fetchManifest('lst_slow', {
        version: 1,
        transport,
        cache: createManifestCache(),
        sleep: noWait,
        timeoutMs: 10,
        retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1, random: () => 1 },
      }),
    );
    expect(error.reason).toBe('timeout');
    expect(error.staticPath).toBe(true);
  });

  it('rejects a body that is not a manifest rather than rendering half of one', async () => {
    const error = await failure(
      fetchManifest('lst_bad', {
        version: 1,
        transport: async () => response(200, { listingId: 'lst_bad' }),
        cache: createManifestCache(),
        sleep: noWait,
      }),
    );
    expect(error.reason).toBe('malformed');
  });
});

describe('loadStaticPathManifest — metadata cached, permission never', () => {
  /** What the manifest endpoint returns once the media split is real: sizes, not permissions. */
  function metadataOnly(): AssetManifest {
    const m = manifestFor('lst_01', 3, '/should-not-be-trusted');
    const { signedUrl: _drop, ...poster } = m.poster as never as { signedUrl: string };
    return { ...m, poster: poster as never };
  }

  it('serves the manifest from cache while re-resolving the URL only past its expiry', async () => {
    let now = 1_000;
    let manifestCalls = 0;
    let urlCalls = 0;
    const transport: Transport = async () => {
      manifestCalls += 1;
      return response(200, metadataOnly());
    };
    const urlTransport: Transport = async () => {
      urlCalls += 1;
      return response(200, { url: `https://media/signed/${urlCalls}`, expiresAtMs: now + 5_000 });
    };
    const options = {
      version: 3,
      transport,
      urlTransport,
      cache: createManifestCache(),
      urlCache: createSignedUrlCache(),
      now: () => now,
      sleep: noWait,
    };

    const first = await loadStaticPathManifest('lst_01', options);
    expect((first.poster as { signedUrl?: string }).signedUrl).toBe('https://media/signed/1');

    const second = await loadStaticPathManifest('lst_01', options);
    // Metadata came from cache; the URL was still inside its TTL so it was reused, not re-fetched.
    expect(manifestCalls).toBe(1);
    expect(urlCalls).toBe(1);
    expect((second.poster as { signedUrl?: string }).signedUrl).toBe('https://media/signed/1');

    now = 6_500;
    const third = await loadStaticPathManifest('lst_01', options);
    // Past expiry the buyer gets a new permission slip, and the manifest is still not refetched.
    expect(manifestCalls).toBe(1);
    expect(urlCalls).toBe(2);
    expect((third.poster as { signedUrl?: string }).signedUrl).toBe('https://media/signed/2');
  });

  it('leaves a URL that the manifest already carries alone', async () => {
    let urlCalls = 0;
    const options = {
      version: 3,
      transport: (async () => response(200, manifestFor('lst_01', 3, '/signed/given'))) as Transport,
      urlTransport: (async () => {
        urlCalls += 1;
        return response(200, { url: 'https://media/should-not-be-called' });
      }) as Transport,
      cache: createManifestCache(),
      urlCache: createSignedUrlCache(),
      sleep: noWait,
    };
    const loaded = await loadStaticPathManifest('lst_01', options);
    expect((loaded.poster as { signedUrl?: string }).signedUrl).toBe('/signed/given');
    expect(urlCalls).toBe(0);
  });
});

describe('requestSignedUrl', () => {
  it('asks the endpoint once while the URL is still valid', async () => {
    const cache = createSignedUrlCache();
    let now = 1_000;
    let calls = 0;
    const transport: Transport = async () => {
      calls += 1;
      return response(200, { url: 'https://media/signed/a', expiresAtMs: 5_000 });
    };
    const opts = { renditionId: 'ren_lod0', transport, cache, now: () => now };
    await requestSignedUrl(opts);
    await requestSignedUrl(opts);
    expect(calls).toBe(1);
  });

  it('re-requests the URL the instant it expires rather than serving a dead link', async () => {
    const cache = createSignedUrlCache();
    let now = 1_000;
    let calls = 0;
    const transport: Transport = async () => {
      calls += 1;
      return response(200, { url: `https://media/signed/${calls}`, expiresAtMs: 5_000 });
    };
    const first = await requestSignedUrl({ renditionId: 'ren_lod0', transport, cache, now: () => now });
    now = 5_000;
    const second = await requestSignedUrl({ renditionId: 'ren_lod0', transport, cache, now: () => now });
    expect(calls).toBe(2);
    expect(first).not.toBe(second);
  });

  it('never stretches the TTL the endpoint granted', async () => {
    const cache = createSignedUrlCache();
    let calls = 0;
    const transport: Transport = async () => {
      calls += 1;
      return response(200, { url: 'https://media/signed/short', expiresInMs: 1_000 });
    };
    await requestSignedUrl({ renditionId: 'r', transport, cache, now: () => 0 });
    // One second later it is gone, no matter what a local default might have preferred.
    expect(cache.get('r', 1_001)).toBeNull();
    await requestSignedUrl({ renditionId: 'r', transport, cache, now: () => 1_001 });
    expect(calls).toBe(2);
  });
});
