import type { ApiError, SearchFacet, SearchParams, SearchOutcome, Transport } from '@nastech/api-client';
import { searchCatalogue } from '@nastech/api-client';
import type { SearchListing, SearchState } from '../types.js';

/**
 * The transport seam for this feature. The page and the hook talk to `ListingSearchTransport`
 * only — in tests it is the deterministic fake in fixtures.ts, in the app it is
 * `apiListingSearchTransport` over an injected api-client `Transport`. No component in this
 * directory may call fetch, and none does.
 */

export type { SearchFacet, SearchParams };

export type ListingSearchOutcome =
  | {
      readonly kind: 'results';
      readonly items: readonly SearchListing[];
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

export interface ListingSearchRequest {
  readonly state: SearchState;
  readonly limit: number;
}

export interface ListingSearchTransport {
  readonly search: (request: ListingSearchRequest) => Promise<ListingSearchOutcome>;
}

/**
 * State → wire params. Multi-value facets are comma-joined under their facet name; the fake
 * server reads SearchState directly, and the asserted wire shape follows api-client's
 * `f.<name>` convention.
 */
export function stateToSearchParams(state: SearchState, limit: number): SearchParams {
  const filters: Record<string, string | number> = {};
  if (state.conditions.length > 0) filters.condition = state.conditions.join(',');
  if (state.tiers.length > 0) filters.sellerTier = state.tiers.join(',');
  if (state.categories.length > 0) filters.category = state.categories.join(',');
  if (state.locations.length > 0) filters.location = state.locations.join(',');
  if (state.priceMinCents !== null) filters.priceMinCents = state.priceMinCents;
  if (state.priceMaxCents !== null) filters.priceMaxCents = state.priceMaxCents;
  return {
    ...(state.q === '' ? {} : { query: state.q }),
    filters,
    ...(state.cursor === null ? {} : { cursor: state.cursor }),
    limit,
  };
}

/**
 * Adapter over api-client's `searchCatalogue`, which already separates `no_matches` from
 * `failed` — this feature inherits that discrimination rather than re-deciding it, because a
 * caller that collapses the two is the failure mode the client was written against.
 *
 * CONTRACT-GAP: the wire items are `ListingSummary`; the pilot-only fields on `SearchListing`
 * (condition, locationSlug, postedAt) simply arrive absent until api-contracts grows them. The
 * UI hides those meta lines rather than inventing values.
 */
export function apiListingSearchTransport(
  transport: Transport,
  tuning: { readonly timeoutMs?: number } = {},
): ListingSearchTransport {
  return {
    async search({ state, limit }: ListingSearchRequest): Promise<ListingSearchOutcome> {
      const outcome: SearchOutcome = await searchCatalogue(transport, stateToSearchParams(state, limit), tuning);
      if (outcome.kind === 'failed') return outcome;
      if (outcome.kind === 'no_matches') return outcome;
      return {
        kind: 'results',
        items: outcome.items,
        totalMatched: outcome.totalMatched,
        nextCursor: outcome.nextCursor,
        facets: outcome.facets,
      };
    },
  };
}
