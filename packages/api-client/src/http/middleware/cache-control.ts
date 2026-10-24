/**
 * Cache control, with the money paths excluded by rule rather than by rememberance.
 *
 * The honest default is *no caching*: `nastech-market-php` has no HTTP layer, so no response today
 * declares a freshness lifetime, and a client that invents one would serve a stale "AVAILABLE"
 * listing to a buyer whose item sold four minutes ago. A response is therefore stored only when the
 * server says `cache-control: max-age=N`, and even then the lifetime is clamped: an asset manifest
 * may be good for a year to a CDN, but a browser tab that holds it for a year is a tab that shows a
 * deleted listing.
 *
 * Money paths are never read from cache whatever the headers say. An order status, a handover
 * window or a payout figure is a fact about the ledger at this instant; a cached copy is not a
 * faster answer but a different answer, and the two look identical in the UI. That is worth a
 * request on a Johannesburg LTE connection.
 */

import { RequestAborted, abortReasonOf } from '../../abort.js';
import type { Middleware, MiddlewareContext, Next, RawResponse } from '../middleware.js';
import { requestCacheKey } from '../query.js';

/** Paths whose answer is a ledger fact. Served live or not at all. */
const MONEY_SEGMENT = /\/(orders|checkout|payments|payment|handover|payout|payouts|settlement|settlements|refunds?)\b/i;

export function isMoneyPath(path: string): boolean {
  return MONEY_SEGMENT.test(path);
}

export interface CacheControlDirectives {
  readonly noStore: boolean;
  readonly noCache: boolean;
  readonly privateOnly: boolean;
  readonly maxAgeMs: number | undefined;
}

export function parseCacheControl(header: string | undefined): CacheControlDirectives {
  const directives = { noStore: false, noCache: false, privateOnly: false, maxAgeMs: undefined as number | undefined };
  if (header === undefined) return directives;
  for (const raw of header.split(',')) {
    const part = raw.trim().toLowerCase();
    if (part === 'no-store') directives.noStore = true;
    else if (part === 'no-cache') directives.noCache = true;
    else if (part === 'private') directives.privateOnly = true;
    else if (part.startsWith('max-age=')) {
      const seconds = Number(part.slice('max-age='.length));
      if (Number.isFinite(seconds) && seconds >= 0) directives.maxAgeMs = Math.round(seconds * 1000);
    }
  }
  return directives;
}

interface StoreEntry {
  readonly response: RawResponse;
  readonly expiresAtMs: number;
}

export interface ResponseCache {
  get(key: string): RawResponse | undefined;
  set(key: string, response: RawResponse, ttlMs: number): void;
  /** Prefix match, because an invalidation says "everything under `/v1/search`", not one cursor. */
  invalidate(prefixes: readonly string[]): number;
  size(): number;
  clear(): void;
}

export interface ResponseCacheOptions {
  readonly maxEntries?: number;
  readonly now?: () => number;
}

export function createResponseCache(options: ResponseCacheOptions = {}): ResponseCache {
  const maxEntries = options.maxEntries ?? 64;
  const now = options.now ?? ((): number => Date.now());
  const store = new Map<string, StoreEntry>();

  return {
    get(key): RawResponse | undefined {
      const entry = store.get(key);
      if (entry === undefined) return undefined;
      if (entry.expiresAtMs <= now()) {
        store.delete(key);
        return undefined;
      }
      return entry.response;
    },
    set(key, response, ttlMs): void {
      if (ttlMs <= 0) return;
      // Bounded, because a search page that pages 200 deep would otherwise hold 200 bodies for the
      // lifetime of the tab, and the first-paint budget is not the only memory budget there is.
      if (store.size >= maxEntries) {
        const oldest = store.keys().next();
        if (!oldest.done) store.delete(oldest.value);
      }
      store.set(key, { response, expiresAtMs: now() + ttlMs });
    },
    invalidate(prefixes): number {
      if (prefixes.length === 0) return 0;
      let dropped = 0;
      for (const key of [...store.keys()]) {
        if (prefixes.some((prefix) => key.startsWith(prefix))) {
          store.delete(key);
          dropped += 1;
        }
      }
      return dropped;
    },
    size(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
  };
}

export interface CacheControlOptions {
  readonly cache: ResponseCache;
  /** Server silence means no caching. Any positive default here would be a lie about freshness. */
  readonly defaultTtlMs?: number;
  /** Even a `max-age=31536000` is not honoured past this in a tab that shows money-adjacent state. */
  readonly maxTtlMs?: number;
  readonly onStore?: (info: { key: string; ttlMs: number }) => void;
  readonly onHit?: (info: { key: string }) => void;
}

export const DEFAULT_MAX_TTL_MS = 60_000;

export function cacheControlMiddleware(options: CacheControlOptions): Middleware {
  const defaultTtlMs = options.defaultTtlMs ?? 0;
  const maxTtlMs = options.maxTtlMs ?? DEFAULT_MAX_TTL_MS;
  const { cache } = options;

  return async function cacheControl(ctx: MiddlewareContext, next: Next): Promise<RawResponse> {
    const { request } = ctx;

    if (request.method !== 'GET') {
      const response = await next(ctx);
      if (response.ok && request.invalidate !== undefined && request.invalidate.length > 0) {
        cache.invalidate(request.invalidate);
      }
      return response;
    }

    if (isMoneyPath(request.path)) {
      // A money read is live or it is not served from here at all — including not being *evicted*,
      // which is why this returns before the cache is touched.
      return await next(ctx);
    }

    const key = requestCacheKey(request.method, request.path, request.query);
    const hit = cache.get(key);
    // A cancelled page must not be resurrected by a cache hit: the caller has stopped caring and a
    // resolved promise into an unmounted component is the exact bug `abort.ts` exists for.
    if (hit !== undefined) {
      if (ctx.scope.signal.aborted || request.signal?.aborted === true) {
        throw new RequestAborted(abortReasonOf(request.signal) ?? 'navigation', ctx.scope.id);
      }
      options.onHit?.({ key });
      return hit;
    }

    const response = await next(ctx);
    if (!response.ok) return response;

    const directives = parseCacheControl(header(response, 'cache-control'));
    if (directives.noStore) return response;
    const advertised = directives.maxAgeMs;
    const ttlMs = Math.min(advertised ?? defaultTtlMs, maxTtlMs);
    if (ttlMs <= 0) return response;

    cache.set(key, response, ttlMs);
    options.onStore?.({ key, ttlMs });
    return response;
  };
}

function header(response: RawResponse, name: string): string | undefined {
  const key = name.toLowerCase();
  for (const [candidate, value] of Object.entries(response.headers)) {
    if (candidate.toLowerCase() === key) return value;
  }
  return undefined;
}
