/**
 * Catalogue: search with facets and cursor pagination, plus single listing summaries.
 *
 * The one design decision that matters: "no matches" and "search failed" must arrive at the UI
 * as different values, not as the same empty array. To a buyer they look identical; to the
 * pilot's supply plan they mean opposite things — one says "this city has no watches at R500",
 * the other says "our index is down". Both outcomes stay in the returned union; the caller that
 * ignores `kind: 'failed'` will still fail visibly, but it can no longer fail *as an empty
 * result set*.
 */

import type { ListingSummary } from '@nastech/api-contracts';
import { isApiError, ApiError } from './errors.js';
import { execute, executeWithRetry } from './transport.js';
import type { Transport } from './transport.js';

export interface SearchFacetValue {
  readonly value: string;
  readonly count: number;
}

export interface SearchFacet {
  readonly name: string;
  readonly values: readonly SearchFacetValue[];
}

export interface SearchParams {
  readonly query?: string;
  /** Facet filters by facet name, e.g. { brand: 'seiko', priceMaxCents: 600000 }. */
  readonly filters?: Readonly<Record<string, string | number>>;
  readonly cursor?: string;
  readonly limit?: number;
}

export type SearchOutcome =
  | {
      readonly kind: 'results';
      readonly items: readonly ListingSummary[];
      readonly totalMatched: number;
      readonly nextCursor: string | null;
      readonly facets: readonly SearchFacet[];
    }
  | {
      readonly kind: 'no_matches';
      readonly facets: readonly SearchFacet[];
    }
  | {
      readonly kind: 'failed';
      readonly error: ApiError;
    };

interface SearchResponseWire {
  readonly items: readonly ListingSummary[];
  readonly totalMatched: number;
  readonly nextCursor?: string | null;
  readonly facets?: readonly SearchFacet[];
}

/**
 * Never throws for transport reasons — a failure is a `failed` outcome carrying the classified
 * error, because a thrown error in an async search handler is exactly how the two states get
 * collapsed back into "empty". Non-ApiError exceptions (caller bugs) are deliberately not
 * swallowed.
 */
export interface RequestTuning {
  /** Client deadline per request; defaults to DEFAULT_TIMEOUT_MS. Injectable for tests. */
  readonly timeoutMs?: number;
}

export async function searchCatalogue(
  transport: Transport,
  params: SearchParams = {},
  tuning: RequestTuning = {},
): Promise<SearchOutcome> {
  const query: Record<string, string | number | boolean> = {};
  if (params.query !== undefined) query['q'] = params.query;
  if (params.cursor !== undefined) query['cursor'] = params.cursor;
  if (params.limit !== undefined) query['limit'] = params.limit;
  for (const [name, value] of Object.entries(params.filters ?? {})) {
    query[`f.${name}`] = value;
  }

  let wire: SearchResponseWire;
  try {
    // GETs are replay-safe, so a dropped network is retried once inside executeWithRetry.
    // Retrying a search is always safe whether or not the server saw the first attempt.
    wire = await executeWithRetry<SearchResponseWire>(transport, {
      method: 'GET',
      path: '/v1/search',
      ...(Object.keys(query).length > 0 ? { query } : {}),
      ...(tuning.timeoutMs !== undefined ? { timeoutMs: tuning.timeoutMs } : {}),
    });
  } catch (error) {
    if (isApiError(error)) return { kind: 'failed', error };
    throw error;
  }

  const facets = wire.facets ?? [];
  if (wire.items.length === 0 && wire.totalMatched === 0) {
    return { kind: 'no_matches', facets };
  }
  return {
    kind: 'results',
    items: wire.items,
    totalMatched: wire.totalMatched,
    nextCursor: wire.nextCursor ?? null,
    facets,
  };
}

export function getListingSummary(
  transport: Transport,
  listingId: string,
  tuning: RequestTuning = {},
): Promise<ListingSummary> {
  return execute<ListingSummary>(transport, {
    method: 'GET',
    path: `/v1/listings/${encodeURIComponent(listingId)}`,
    ...(tuning.timeoutMs !== undefined ? { timeoutMs: tuning.timeoutMs } : {}),
  });
}
