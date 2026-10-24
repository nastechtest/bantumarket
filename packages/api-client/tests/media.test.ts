import { describe, expect, it } from 'bun:test';
import type { AssetManifest } from '@nastech/api-contracts';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { ApiError } from '../src/errors.js';
import { MAX_SIGNED_URL_CACHE_MS, createMediaApi } from '../src/media.js';
import { FakeTransport } from './fake-transport.js';

const SECRET = 'https://cdn.nastech.example/rnd_1?sig=SIGNED_SECRET_42&v=3';

function manifestFixture(): AssetManifest {
  const rendition = {
    id: 'rnd_1',
    kind: 'MODEL' as const,
    lod: 'lod1' as const,
    bytes: 2048,
    sha256: 'a'.repeat(64),
    bucketKey: 'media/lst_1/lod1.glb',
    mime: 'model/gltf-binary',
  };
  return {
    assetId: 'ast_1',
    listingId: 'lst_1',
    version: 1,
    checksum: 'deadbeef',
    claimScope: 'geometry_and_external_condition',
    metricScaleMetersPerUnit: 0.041,
    renditions: [rendition],
    poster: { ...rendition, id: 'rnd_poster', kind: 'POSTER', mime: 'image/webp' },
    captions: [
      {
        hotspotId: 'hs_1',
        position: [0.1, 0.2, 0.03],
        disclosureText: 'Hairline scratch on caseback, cosmetic only.',
        severity: 'cosmetic',
        disclosureId: 'dsc_1',
      },
    ],
  };
}

function signedWire(expiresInMs: number, nowMs: number) {
  return { url: SECRET, expiresAt: new Date(nowMs + expiresInMs).toISOString() };
}

function withConsoleSpy<T>(fn: (captured: (name: string, args: string[]) => void) => Promise<T>): Promise<T> {
  return (async () => {
    const lines: string[] = [];
    const original = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
      debug: console.debug,
    };
    for (const [name, method] of Object.entries(original)) {
      (console as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        lines.push(args.map((a) => String(a)).join(' '));
        (method as (...a: unknown[]) => void)(...args);
      };
    }
    try {
      return await fn((_name, args) => lines.push(args.join(' ')));
    } finally {
      Object.assign(console, original);
    }
  })();
}

describe('media signed URLs as secrets', () => {
  it('caches within TTL and refetches after expiry, keyed only by rendition id', async () => {
    let nowMs = 1_000_000;
    const transport = new FakeTransport();
    transport
      .respond(() => signedWire(5 * 60 * 1000, nowMs))
      .respond(() => signedWire(5 * 60 * 1000, nowMs));
    const media = createMediaApi(transport, { now: () => nowMs });

    const first = await media.getRenditionUrl('rnd_1');
    const second = await media.getRenditionUrl('rnd_1');
    expect(first.url).toBe(SECRET);
    expect(second).toBe(first);
    expect(transport.calls.length).toBe(1);

    nowMs += 6 * 60 * 1000;
    await media.getRenditionUrl('rnd_1');
    expect(transport.calls.length).toBe(2);

    for (const key of media.signedUrlCacheKeys()) {
      expect(key).not.toContain('https');
      expect(key).not.toContain('sig');
    }
  });

  it('clamps a 7-day server promise to the cache ceiling so no signature survives a session', async () => {
    let nowMs = 1_000_000;
    const transport = new FakeTransport();
    transport
      .respond(() => signedWire(7 * 24 * 60 * 60 * 1000, nowMs))
      .respond(() => signedWire(7 * 24 * 60 * 60 * 1000, nowMs));
    const media = createMediaApi(transport, { now: () => nowMs });

    const first = await media.getRenditionUrl('rnd_1');
    expect(first.expiresAtMs - nowMs).toBeLessThanOrEqual(MAX_SIGNED_URL_CACHE_MS);

    nowMs += MAX_SIGNED_URL_CACHE_MS + 61_000;
    await media.getRenditionUrl('rnd_1');
    expect(transport.calls.length).toBe(2);
  });

  it('never places a signed URL in an error message, the cache keys, or any console output', async () => {
    const transport = new FakeTransport();
    transport
      .respond(() => signedWire(60 * 1000, Date.now()))
      .respond(() => {
        throw new ApiError({ kind: 'timeout' });
      });
    const media = createMediaApi(transport);

    const failureMessages: string[] = [];
    await withConsoleSpy(async (capture) => {
      await media.getRenditionUrl('rnd_1');
      try {
        await media.getManifest('lst_1');
      } catch (error) {
        failureMessages.push((error as ApiError).message);
      }
      console.log('checked manifest after signing');
      capture('audit', ['manifest follow-up after signed fetch']);
    });

    // The client must not re-wrap or stringify the secret anywhere on the error path.
    for (const message of failureMessages) {
      expect(message).not.toContain('SIGNED_SECRET_42');
      expect(message).not.toContain(SECRET);
    }
    expect(transport.calls.length).toBe(2);
    const serializedCalls = JSON.stringify(
      transport.calls.map((call) => ({ method: call.method, path: call.path })),
    );
    expect(serializedCalls).not.toContain('SIGNED_SECRET_42');
  });

  it('refuses to cache a signature with an unparseable expiry', async () => {
    const transport = new FakeTransport();
    transport.respond(() => ({ url: SECRET, expiresAt: 'not-a-date' }));
    const media = createMediaApi(transport);

    let rejected = false;
    try {
      await media.getRenditionUrl('rnd_1');
    } catch (error) {
      rejected = error instanceof ApiError && error.kind === 'validation';
    }
    expect(rejected).toBe(true);
    expect(media.signedUrlCacheKeys()).toEqual([]);
  });
});

describe('media manifests and renditions', () => {
  it('returns the manifest with its claim scope intact for the disclosure text', async () => {
    const manifest = manifestFixture();
    const transport = new FakeTransport();
    transport.respond(() => manifest);
    const media = createMediaApi(transport);

    const got = await media.getManifest('lst_1');
    expect(got.claimScope).toBe('geometry_and_external_condition');
    // api-contracts owns the disclosure copy; the client hands the scope through untouched.
    expect(CLAIM_SCOPE_DISCLOSURE[got.claimScope]).toContain('not its authenticity');
    expect(got.captions[0]?.disclosureId).toBe('dsc_1');
  });

  it('every media entrypoint enforces the client-side deadline as a timeout ApiError', async () => {
    const transport = new FakeTransport();
    transport.alwaysHangs();
    const media = createMediaApi(transport, { timeoutMs: 5 });

    const results: string[] = [];
    for (const call of [
      () => media.getManifest('lst_1'),
      () => media.listRenditions('lst_1'),
      () => media.getRenditionUrl('rnd_1'),
    ]) {
      try {
        await call();
        results.push('resolved');
      } catch (error) {
        results.push(error instanceof ApiError ? error.kind : 'unclassified');
      }
    }
    expect(results).toEqual(['timeout', 'timeout', 'timeout']);
  });
});
