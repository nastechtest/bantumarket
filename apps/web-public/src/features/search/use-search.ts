import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError, SearchFacet } from '@nastech/api-client';
import type { ListingSearchTransport } from './api/search-transport.js';
import { rank } from './ranking/parity.js';
import { stateToSearch } from './url-state.js';
import { PAGE_SIZE } from './pagination.js';
import type { SearchListing, SearchState } from './types.js';

/**
 * The search state machine. Its contract is the one the whole feature is built on:
 * `zero` and `failed` are different phases fed by different outcome kinds, and the hook never
 * lets a failure fall through into an empty item list that a component could render as
 * "nothing matches". Stale responses are dropped by a sequence counter — a slow answer to an
 * old query must never overwrite a fast answer to the current one.
 */
export type SearchPhase = 'idle' | 'loading' | 'ready' | 'zero' | 'failed';

export interface SearchViewModel {
  readonly phase: SearchPhase;
  readonly items: readonly SearchListing[];
  readonly totalMatched: number;
  readonly nextCursor: string | null;
  readonly facets: readonly SearchFacet[];
  readonly error: ApiError | null;
  readonly retry: () => void;
}

export function useListingSearch(state: SearchState, transport: ListingSearchTransport): SearchViewModel {
  const [phase, setPhase] = useState<SearchPhase>('idle');
  const [items, setItems] = useState<readonly SearchListing[]>([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [facets, setFacets] = useState<readonly SearchFacet[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);
  const seqRef = useRef(0);

  const key = stateToSearch(state);

  useEffect(() => {
    const seq = ++seqRef.current;
    let cancelled = false;
    setPhase('loading');
    setError(null);
    // Facets and items clear on every new query: counts from the *previous* response would be
    // counts about a different search, and a count about a different search is the lie.
    setFacets([]);
    setItems([]);
    setTotalMatched(0);
    setNextCursor(null);

    transport.search({ state, limit: PAGE_SIZE }).then(
      (outcome) => {
        if (cancelled || seq !== seqRef.current) return;
        if (outcome.kind === 'failed') {
          setError(outcome.error);
          setPhase('failed');
          return;
        }
        if (outcome.kind === 'no_matches') {
          setFacets(outcome.facets);
          setPhase('zero');
          return;
        }
        // Ranking happens client-side over the *page* it was served; parity.test.ts proves the
        // ranker cannot see has3d. The server order is never trusted, the server counts always are.
        setItems(rank(outcome.items, { sort: state.sort, query: state.q }));
        setTotalMatched(outcome.totalMatched);
        setNextCursor(outcome.nextCursor);
        setFacets(outcome.facets);
        setPhase('ready');
      },
      // A rejection here is a caller bug (the transport contract says outcome, not throw).
      // Leaving it unhandled would swallow a programming error; making it `failed` would lie
      // about the index. So: surface via console and go idle, visibly empty but not "zero".
      (bug: unknown) => {
        if (cancelled || seq !== seqRef.current) return;
        console.error('search transport rejected (contract violation, not an index failure):', bug);
        setPhase('idle');
      },
    );

    return () => {
      cancelled = true;
    };
    // `key` is the serialised state: it changes exactly when a new search is warranted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, transport]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return { phase, items, totalMatched, nextCursor, facets, error, retry };
}
