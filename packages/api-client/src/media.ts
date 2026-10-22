/**
 * Media: manifests, rendition listings, and signed URLs.
 *
 * Signed URLs are secrets. They grant time-boxed read access to buyer- and staff-only media, so
 * this module upholds three invariants:
 *   1. a URL never enters an error message or a log line (messages in this client are static per
 *      kind — see errors.ts — and nothing here logs);
 *   2. a URL never outlives its TTL in this client's memory (the cache below evicts on expiry and
 *      clamps any server promise to MAX_SIGNED_URL_CACHE_MS, so a "7-day" signature cannot
 *      survive a session through our cache);
 *   3. the cache key is the rendition id only — a URL in a cache key tends to leak into cache
 *      dumps and metrics labels the same way a URL in a log does.
 */

import type { AssetManifest, Rendition } from '@nastech/api-contracts';
import { ApiError } from './errors.js';
import { execute } from './transport.js';
import type { Transport } from './transport.js';

/** Server-issued, time-boxed media URL. Treat `url` like a password while it is live. */
export interface SignedUrl {
  readonly url: string;
  /** Epoch ms after which the url is dead. Authoritative for our cache, advisory for the CDN. */
  readonly expiresAtMs: number;
}

/** Never hold a signed URL in memory longer than this, whatever the server says (07 §6.5). */
export const MAX_SIGNED_URL_CACHE_MS = 10 * 60 * 1000;

/** Refetch this much before true expiry so an in-flight render never hits a dead signature. */
const TTL_SAFETY_MARGIN_MS = 30 * 1000;

interface SignedUrlWire {
  readonly url: string;
  /** ISO-8601; the wire is ISO everywhere in this client, epoch ms only in memory. */
  readonly expiresAt: string;
}

export interface MediaApi {
  getManifest(listingId: string): Promise<AssetManifest>;
  listRenditions(listingId: string): Promise<readonly Rendition[]>;
  /** Cached within TTL; a fresh fetch after expiry. Never logs, never echoes the URL into an error. */
  getRenditionUrl(renditionId: string): Promise<SignedUrl>;
  /** Diagnostics (tests, devtools): the rendition ids currently held, never their URLs. */
  signedUrlCacheKeys(): readonly string[];
}

export interface MediaApiOptions {
  readonly now?: () => number;
  /** Client deadline per request; defaults to DEFAULT_TIMEOUT_MS. Injectable for tests. */
  readonly timeoutMs?: number;
}

export function createMediaApi(transport: Transport, options: MediaApiOptions = {}): MediaApi {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs;
  const cache = new Map<string, SignedUrl>();

  async function getRenditionUrl(renditionId: string): Promise<SignedUrl> {
    const at = now();
    const cached = cache.get(renditionId);
    if (cached !== undefined) {
      if (cached.expiresAtMs - TTL_SAFETY_MARGIN_MS > at) {
        return cached;
      }
      // Expired (or expiring inside the margin): drop the secret before anything else happens,
      // including the failure path of the refetch below.
      cache.delete(renditionId);
    }

    const wire = await execute<SignedUrlWire>(transport, {
      method: 'GET',
      path: `/v1/renditions/${encodeURIComponent(renditionId)}/url`,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });

    const expiresAtMs = Date.parse(wire.expiresAt);
    if (Number.isNaN(expiresAtMs)) {
      // A signature without a parseable expiry is a signature we cannot bound; refuse to cache
      // it and hand the caller an error rather than an unbounded secret.
      throw new ApiError({ kind: 'validation' });
    }
    const bounded: SignedUrl = {
      url: wire.url,
      expiresAtMs: Math.min(expiresAtMs, now() + MAX_SIGNED_URL_CACHE_MS),
    };
    cache.set(renditionId, bounded);
    return bounded;
  }

  return {
    getManifest(listingId: string) {
      return execute<AssetManifest>(transport, {
        method: 'GET',
        path: `/v1/listings/${encodeURIComponent(listingId)}/manifest`,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
    },
    listRenditions(listingId: string) {
      return execute<readonly Rendition[]>(transport, {
        method: 'GET',
        path: `/v1/listings/${encodeURIComponent(listingId)}/renditions`,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
    },
    getRenditionUrl,
    signedUrlCacheKeys() {
      return [...cache.keys()];
    },
  };
}
