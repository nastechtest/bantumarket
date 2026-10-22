import { isAbortError, nextRetry, DEFAULT_RETRY, type RetryConfig } from './retry-policy.js';
import type { AssetManifest } from '@nastech/api-contracts';

/**
 * Manifest fetch (07 §4.1 `loading/`).
 *
 * Two caches with two different lifetimes, deliberately kept apart: the manifest is metadata and is
 * stable until the asset is re-cut, so it caches by `listingId + version` and survives; a signed URL
 * is a permission slip with an expiry, and caching one past its TTL is how a buyer ends up staring at
 * a broken image they cannot reload. The manifest cache never holds a URL.
 */

export interface TransportResponse {
  readonly status: number;
  readonly ok: boolean;
  json(): Promise<unknown>;
}

export type Transport = (input: string, init: { readonly signal: AbortSignal }) => Promise<TransportResponse>;

export interface FetchManifestOptions {
  /** Known from the listing, so a re-render does not refetch the same version. */
  readonly version?: number;
  readonly transport?: Transport;
  readonly signal?: AbortSignal;
  /** Refuse a hung connection rather than letting it look like a slow one. */
  readonly timeoutMs?: number;
  readonly retry?: RetryConfig;
  readonly cache?: ManifestCache;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly baseUrl?: string;
}

export class ManifestFetchError extends Error {
  readonly status: number | null;
  readonly reason: 'client-error' | 'not-retryable' | 'aborted' | 'attempts-exhausted' | 'malformed' | 'timeout';
  /** Every failure mode hands the caller the static path; there is no failure mode that does not. */
  readonly staticPath = true as const;

  constructor(
    reason: ManifestFetchError['reason'],
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = 'ManifestFetchError';
    this.reason = reason;
    this.status = status;
  }
}

const transport: Transport = (input, init) =>
  fetch(input, init).then((r) => ({ status: r.status, ok: r.ok, json: () => r.json() }));

export interface ManifestCache {
  read(listingId: string, version: number): AssetManifest | null;
  write(manifest: AssetManifest): void;
  invalidate(listingId: string, version?: number): void;
  clear(): void;
  readonly size: number;
}

/**
 * The store keeps a manifest with every signed URL removed, so the only way a cached entry can hand
 * back a permission slip is one that was re-issued after the cache was written.
 */
function withoutUrls(manifest: AssetManifest): AssetManifest {
  // `signedUrl` is not on `Rendition` — the media endpoint supplies it out-of-band — so this works on
  // the key, not on a typed field, and keeps the whole shape intact.
  const strip = <T extends object>(rendition: T): T => {
    if (!('signedUrl' in rendition)) return rendition;
    const copy: Record<string, unknown> = { ...rendition };
    delete copy.signedUrl;
    return copy as unknown as T;
  };
  return {
    ...manifest,
    poster: strip(manifest.poster),
    ...(manifest.sprite ? { sprite: strip(manifest.sprite) } : {}),
    renditions: manifest.renditions.map((r) => strip(r)),
  };
}

export function createManifestCache(): ManifestCache {
  const store = new Map<string, AssetManifest>();
  const key = (listingId: string, version: number) => `${listingId}@${version}`;
  return {
    read: (listingId, version) => store.get(key(listingId, version)) ?? null,
    write: (manifest) => {
      store.set(key(manifest.listingId, manifest.version), withoutUrls(manifest));
    },
    invalidate: (listingId, version) => {
      if (typeof version === 'number') {
        store.delete(key(listingId, version));
        return;
      }
      for (const k of [...store.keys()]) if (k.startsWith(`${listingId}@`)) store.delete(k);
    },
    clear: () => store.clear(),
    get size() {
      return store.size;
    },
  };
}

const sharedCache = createManifestCache();
export const manifestCache = sharedCache;

/** Resolves the manifest for a listing, or fails in a way the caller can render. */
export async function fetchManifest(listingId: string, options: FetchManifestOptions = {}): Promise<AssetManifest> {
  const {
    version,
    transport: send = transport,
    signal,
    timeoutMs = 12_000,
    retry = DEFAULT_RETRY,
    cache = sharedCache,
    sleep = delaySleep,
    baseUrl = '/api/assets/manifest',
  } = options;

  if (typeof version === 'number') {
    const cached = cache.read(listingId, version);
    if (cached) return cached;
  }

  const url = `${baseUrl}?listingId=${encodeURIComponent(listingId)}${
    typeof version === 'number' ? `&version=${version}` : ''
  }`;

  let attempt = 0;
  let lastStatus: number | null = null;

  for (;;) {
    attempt += 1;
    const controller = new AbortController();
    const onAbort = () => controller.abort(new DOMException('Manifest fetch cancelled', 'AbortError'));
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(new Error('timeout')), timeoutMs) : null;

    try {
      const response = await send(url, { signal: controller.signal });
      lastStatus = response.status;
      if (!response.ok) {
        const outcome = nextRetry(attempt, { status: response.status }, retry);
        if (outcome.retry) {
          await sleep(outcome.delayMs, signal);
          continue;
        }
        throw new ManifestFetchError(
          outcome.reason,
          `Manifest for ${listingId} refused with HTTP ${response.status} after ${attempt} attempt(s).`,
          response.status,
        );
      }
      const manifest = await readManifest(response);
      cache.write(manifest);
      // The cached copy is url-stripped; hand the caller the fresh one it is entitled to see.
      return manifest;
    } catch (error) {
      if (error instanceof ManifestFetchError) throw error;
      if (isAbortError(error)) {
        if (signal?.aborted) throw new ManifestFetchError('aborted', `Manifest fetch for ${listingId} was cancelled.`);
        // Our own timeout fired; that is transient, so it belongs to the retry budget.
        const outcome = nextRetry(attempt, {}, retry);
        if (outcome.retry) {
          await sleep(outcome.delayMs, signal);
          continue;
        }
        throw new ManifestFetchError('timeout', `Manifest for ${listingId} timed out after ${attempt} attempt(s).`, lastStatus);
      }
      const outcome = nextRetry(attempt, { error }, retry);
      if (outcome.retry) {
        await sleep(outcome.delayMs, signal);
        continue;
      }
      throw new ManifestFetchError('not-retryable', `Manifest for ${listingId} could not be fetched: ${String(error)}`);
    } finally {
      if (timer !== null) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

async function readManifest(response: TransportResponse): Promise<AssetManifest> {
  const body = (await response.json()) as Partial<AssetManifest> | null;
  if (!body || typeof body.listingId !== 'string' || typeof body.version !== 'number' || !Array.isArray(body.renditions)) {
    throw new ManifestFetchError('malformed', 'Manifest response is missing listingId, version or renditions.', response.status);
  }
  return body as AssetManifest;
}

export function delaySleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Sleep aborted', 'AbortError'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Signed URLs, separately cached by their own expiry. This is the only place a URL is kept, and it
 * keeps it no longer than the endpoint said it was valid.
 */
export interface SignedUrlEntry {
  readonly url: string;
  readonly expiresAtMs: number;
}

export interface SignedUrlCache {
  get(renditionId: string, nowMs: number): string | null;
  set(renditionId: string, entry: SignedUrlEntry): void;
  clear(): void;
}

export function createSignedUrlCache(): SignedUrlCache {
  const store = new Map<string, SignedUrlEntry>();
  return {
    // An entry at or past its expiry is never returned, even if nobody has swept it yet.
    get: (renditionId, nowMs) => {
      const hit = store.get(renditionId);
      if (!hit) return null;
      if (hit.expiresAtMs <= nowMs) {
        store.delete(renditionId);
        return null;
      }
      return hit.url;
    },
    set: (renditionId, entry) => store.set(renditionId, entry),
    clear: () => store.clear(),
  };
}

export interface SignedUrlOptions {
  readonly renditionId: string;
  readonly transport?: Transport;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly cache?: SignedUrlCache;
  /** Only used when the endpoint does not say; it is a ceiling, never an extension. */
  readonly fallbackTtlMs?: number;
}

/** Ask the media endpoint for one URL. The response's own expiry always wins over our default. */
export async function requestSignedUrl(options: SignedUrlOptions): Promise<string> {
  const {
    renditionId,
    transport: send = transport,
    signal,
    now = () => Date.now(),
    cache = signedUrlCache,
    fallbackTtlMs = 60_000,
  } = options;

  const nowMs = now();
  const cached = cache.get(renditionId, nowMs);
  if (cached) return cached;

  const response = await send(`/api/assets/url?renditionId=${encodeURIComponent(renditionId)}`, {
    signal: signal ?? new AbortController().signal,
  });
  if (!response.ok) {
    throw new ManifestFetchError('not-retryable', `Signed URL for ${renditionId} refused with HTTP ${response.status}.`, response.status);
  }
  const body = (await response.json()) as { url?: string; expiresAtMs?: number; expiresInMs?: number };
  if (typeof body.url !== 'string' || body.url.length === 0) {
    throw new ManifestFetchError('malformed', `Signed URL response for ${renditionId} carried no url.`);
  }
  const ttl = typeof body.expiresInMs === 'number' ? Math.max(0, body.expiresInMs) : fallbackTtlMs;
  const expiresAtMs = typeof body.expiresAtMs === 'number' ? body.expiresAtMs : nowMs + ttl;
  // Clamp to whatever the endpoint granted; a long life is never invented here.
  cache.set(renditionId, { url: body.url, expiresAtMs });
  return body.url;
}

export const signedUrlCache = createSignedUrlCache();

export interface LoadManifestOptions extends FetchManifestOptions {
  /** Where to ask for a URL. Defaults to the same transport, against the media endpoint. */
  readonly urlTransport?: Transport;
  readonly urlCache?: SignedUrlCache;
  readonly now?: () => number;
}

/**
 * The shape the static path actually consumes: a manifest whose poster and sprite carry a URL that is
 * live right now. The metadata may come from cache; the permission to read the bytes may not, so a
 * cached manifest has its URLs re-resolved here rather than at capture time.
 */
export async function loadStaticPathManifest(
  listingId: string,
  options: LoadManifestOptions = {},
): Promise<AssetManifest> {
  const manifest = await fetchManifest(listingId, options);
  const { urlTransport = transport, urlCache = signedUrlCache, now = () => Date.now(), signal } = options;

  const needsUrl = (rendition: { id: string; signedUrl?: string }): boolean =>
    typeof (rendition as { signedUrl?: string }).signedUrl !== 'string';

  const hydrate = async <T extends { id: string }>(rendition: T): Promise<T> => {
    const withUrl = rendition as T & { signedUrl?: string };
    if (!needsUrl(withUrl)) return rendition;
    const url = await requestSignedUrl({
      renditionId: rendition.id,
      transport: urlTransport,
      cache: urlCache,
      now,
      ...(signal ? { signal } : {}),
    });
    return { ...rendition, signedUrl: url } as T;
  };

  return {
    ...manifest,
    poster: await hydrate(manifest.poster),
    ...(manifest.sprite ? { sprite: await hydrate(manifest.sprite) } : {}),
  } as AssetManifest;
}
