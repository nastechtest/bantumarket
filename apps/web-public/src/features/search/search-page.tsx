import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, StyleSheet } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import type { ListingSearchTransport } from './api/search-transport.js';
import { fakeListingSearch, PILOT_CORPUS } from './api/fixtures.js';
import { FacetPanel } from './facets/facet-panel.js';
import { activeFacetCount, clearAllFacets, hasActiveFilters, setPriceRange, toggleFacet } from './facets/facet-state.js';
import type { MultiFacetName, SearchState } from './types.js';
import { defaultSearchState } from './types.js';
import { parseSearchState, stateToSearch } from './url-state.js';
import { PAGE_SIZE } from './pagination.js';
import { trailPop, trailPush } from './pagination.js';
import type { CursorTrail } from './pagination.js';
import { useListingSearch } from './use-search.js';
import { SearchBar } from './search-bar.js';
import { ResultGrid } from './results/result-grid.js';
import { ListingCount } from './results/listing-count.js';
import { SortControl } from './results/sort-control.js';
import { SkeletonGrid } from './results/skeleton-grid.js';
import { ZeroResult } from './zero-result/zero-result.js';
import { NoIndexYet } from './zero-result/no-index-yet.js';
import { PARITY_STATEMENT } from './ranking/parity.js';

/**
 * Event a same-tab URL write fires so every mounted search surface agrees on the query state.
 * The hand-rolled router only listens to popstate; the pathname never changes on a search
 * refinement, so this feature owns its own micro-subscription rather than importing router
 * internals (which would pull the whole route table into a first-paint chunk).
 */
export const SEARCH_URL_EVENT = 'nastech:search-url';

function readLocationSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

/**
 * Query state lives in the URL. A shared link reproduces a search exactly, facets included —
 * that is the load-bearing property of this component, and `applyState` is the only writer:
 * history push, then the local mirror, in that order, so a back press always finds a real URL.
 */
export function SearchPage({ transport }: { readonly transport?: ListingSearchTransport } = {}) {
  const [fallbackTransport] = useState<ListingSearchTransport>(() =>
    // No HTTP server exists yet (ADR 0002); the fake transport is what the pilot screen runs
    // on today, and the production adapter (apiListingSearchTransport) slots in unchanged.
    fakeListingSearch({ corpus: PILOT_CORPUS }),
  );
  const activeTransport = transport ?? fallbackTransport;

  const [state, setState] = useState<SearchState>(() => parseSearchState(readLocationSearch()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [trail, setTrail] = useState<CursorTrail>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const sync = () => setState(parseSearchState(readLocationSearch()));
    window.addEventListener('popstate', sync);
    window.addEventListener(SEARCH_URL_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(SEARCH_URL_EVENT, sync);
    };
  }, []);

  const applyState = useCallback((next: SearchState) => {
    const search = stateToSearch(next);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `${window.location.pathname}${search}`);
      window.dispatchEvent(new Event(SEARCH_URL_EVENT));
    }
    setState(next);
  }, []);

  // A new search (query, facets, sort) invalidates the back-stack; only paging extends it.
  const replaceState = useCallback(
    (next: SearchState) => {
      setTrail([]);
      applyState(next);
    },
    [applyState],
  );

  const model = useListingSearch(state, activeTransport);

  const onQuery = useCallback(
    (q: string) => replaceState({ ...stateRef.current, q, cursor: null }),
    [replaceState],
  );
  const onSort = useCallback(
    (sort: SearchState['sort']) => replaceState({ ...stateRef.current, sort }),
    [replaceState],
  );
  const onToggleFacet = useCallback(
    (name: MultiFacetName, value: string) => replaceState(toggleFacet(stateRef.current, name, value)),
    [replaceState],
  );
  const onPriceRange = useCallback(
    (minCents: number | null, maxCents: number | null) =>
      replaceState(setPriceRange(stateRef.current, minCents, maxCents)),
    [replaceState],
  );
  const onClearFilters = useCallback(() => replaceState(clearAllFacets(stateRef.current)), [replaceState]);
  const onSeeAll = useCallback(() => replaceState(defaultSearchState()), [replaceState]);
  const onPickCategory = useCallback(
    (slug: string) => {
      const next = clearAllFacets(stateRef.current);
      replaceState({ ...next, q: '', categories: [slug] });
    },
    [replaceState],
  );

  const onNextPage = useCallback(() => {
    if (model.nextCursor === null) return;
    setTrail((current) => trailPush(current, stateRef.current.cursor));
    applyState({ ...stateRef.current, cursor: model.nextCursor });
  }, [applyState, model.nextCursor]);

  const onBackPage = useCallback(() => {
    const { cursor, rest } = trailPop(trail);
    setTrail(rest);
    applyState({ ...stateRef.current, cursor });
  }, [applyState, trail]);

  const filterCount = activeFacetCount(state);
  const showPagination = model.phase === 'ready' && (model.nextCursor !== null || trail.length > 0);
  const limit = PAGE_SIZE;
  const shown = useMemo(() => model.items.length, [model.items.length]);

  return (
    <section data-search-page="" style={{ fontFamily: raw.type.familyText, color: tokens.text.primary }}>
      <StyleSheet />
      <header style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s3, paddingBlock: raw.space.s4 }}>
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.5rem' }}>Search NasTech Market</h1>
        <SearchBar value={state.q} onSubmit={onQuery} />
      </header>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: raw.space.s3,
          flexWrap: 'wrap',
          paddingBlock: raw.space.s2,
          position: 'sticky',
          top: 0,
          background: tokens.surface.primary,
          zIndex: 5,
        }}
      >
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          data-filters-button=""
          style={{
            minHeight: 44,
            padding: `${raw.space.s2} ${raw.space.s4}`,
            border: `1px solid ${raw.color.accent600}`,
            borderRadius: raw.radius.pill,
            background: filterCount > 0 ? tokens.surface.raised : 'transparent',
            color: tokens.action.default,
            fontSize: '0.9375rem',
            cursor: 'pointer',
          }}
        >
          Filters{filterCount > 0 ? ` (${filterCount})` : ''}
        </button>
        <ListingCount phase={model.phase} totalMatched={model.totalMatched} shown={trail.length * limit + shown} />
        <div style={{ marginLeft: 'auto' }}>
          <SortControl value={state.sort} onChange={onSort} />
        </div>
      </div>

      <div style={{ paddingBlock: raw.space.s4 }}>
        {model.phase === 'loading' || model.phase === 'idle' ? <SkeletonGrid count={6} /> : null}
        {model.phase === 'failed' ? <NoIndexYet error={model.error} onRetry={model.retry} /> : null}
        {model.phase === 'zero' ? (
          <ZeroResult
            state={state}
            facets={model.facets}
            onClearFilters={onClearFilters}
            onSeeAll={onSeeAll}
            onPickCategory={onPickCategory}
          />
        ) : null}
        {model.phase === 'ready' ? <ResultGrid items={model.items} /> : null}

        {showPagination ? (
          <nav aria-label="Search pages" style={{ display: 'flex', gap: raw.space.s3, marginTop: raw.space.s5 }}>
            {trail.length > 0 ? (
              <button
                type="button"
                onClick={onBackPage}
                style={{
                  minHeight: 44,
                  padding: `${raw.space.s2} ${raw.space.s4}`,
                  border: `1px solid ${raw.color.ink100}`,
                  borderRadius: raw.radius.sm,
                  background: tokens.surface.primary,
                  color: tokens.text.primary,
                  fontSize: '0.9375rem',
                  cursor: 'pointer',
                }}
              >
                Previous page
              </button>
            ) : null}
            {model.nextCursor !== null ? (
              <button
                type="button"
                onClick={onNextPage}
                data-next-page=""
                style={{
                  minHeight: 44,
                  padding: `${raw.space.s2} ${raw.space.s4}`,
                  border: 'none',
                  borderRadius: raw.radius.sm,
                  background: tokens.action.default,
                  color: tokens.text.onInverse,
                  fontSize: '0.9375rem',
                  cursor: 'pointer',
                }}
              >
                Next page
              </button>
            ) : null}
          </nav>
        ) : null}
      </div>

      {/* 07 §6.4 on the public surface: the parity rule stated in the same register as the copy.
          Spec §13.2: plain text, no glow, no badge — a rule about fairness is not a trust claim. */}
      <p className="disclosure" data-parity-statement="" style={{ color: tokens.text.secondary, fontSize: '0.8125rem' }}>
        {PARITY_STATEMENT}
      </p>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filter results">
        <FacetPanel
          state={state}
          facets={model.facets}
          onToggleFacet={onToggleFacet}
          onPriceRange={onPriceRange}
          onClearAll={onClearFilters}
        />
        {hasActiveFilters(state) ? null : (
          <p style={{ color: tokens.text.secondary, fontSize: '0.8125rem', marginTop: raw.space.s4 }}>
            Facet counts arrive with each response — they describe all matching listings, not just this page.
          </p>
        )}
      </Sheet>
    </section>
  );
}
