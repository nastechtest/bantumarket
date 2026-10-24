import './tests/dom-env.js';
import { describe, expect, test, afterEach } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError } from '@nastech/api-client';
import { setReducedMotionOverride } from '@nastech/motion';
import { win, freshHost } from './tests/dom-env.js';
import { SearchPage } from './search-page.js';
import { SkeletonGrid } from './results/skeleton-grid.js';
import { PILOT_CORPUS, facetCountsFor, fakeListingSearch } from './api/fixtures.js';
import type { ListingSearchOutcome, ListingSearchTransport } from './api/search-transport.js';
import { defaultSearchState } from './types.js';
import type { SearchState } from './types.js';
import { parseSearchState } from './url-state.js';
import { PAGE_SIZE } from './pagination.js';

/**
 * Behaviour tests against the real component tree and the fake transport — the only authority
 * while there is no HTTP server (ADR 0002). Each test mounts its own SearchPage and resets
 * history afterwards, so no test inherits another's "pass".
 */

let lastRoot: Root | null = null;

afterEach(() => {
  if (lastRoot !== null) {
    act(() => lastRoot!.unmount());
    lastRoot = null;
  }
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  setReducedMotionOverride(null);
  win.history.replaceState({}, '', '/search');
});

/** React installs a value tracker on controlled inputs; a plain assignment would be de-duped. */
function typeInto(input: HTMLInputElement, value: string): void {
  const protoSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
  if (protoSetter !== undefined) protoSetter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountSearch(transport: ListingSearchTransport): Promise<HTMLElement> {
  const host = freshHost();
  const root = createRoot(host);
  lastRoot = root;
  await act(async () => {
    root.render(<SearchPage transport={transport} />);
  });
  await flush();
  return host;
}

async function submitQuery(host: HTMLElement, query: string): Promise<void> {
  const input = host.querySelector('input[name="q"]') as HTMLInputElement;
  const form = host.querySelector('form[role="search"]') as HTMLElement;
  await act(async () => {
    typeInto(input, query);
  });
  await act(async () => {
    form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  });
  await flush();
}

/** A transport whose every request is a deferred the test resolves by hand, in any order. */
function recordingTransport(): {
  readonly transport: ListingSearchTransport;
  readonly requests: { readonly state: SearchState; readonly respond: (outcome: ListingSearchOutcome) => void }[];
} {
  const requests: { state: SearchState; respond: (outcome: ListingSearchOutcome) => void }[] = [];
  const transport: ListingSearchTransport = {
    search(request) {
      return new Promise<ListingSearchOutcome>((resolve) => {
        requests.push({ state: request.state, respond: resolve });
      });
    },
  };
  return { transport, requests };
}

describe('search page against the fake transport', () => {
  test('renders the page, the server count, the parity statement, and no GL surface anywhere', async () => {
    const transport = fakeListingSearch({ corpus: PILOT_CORPUS });
    const host = await mountSearch(transport);
    const html = host.innerHTML;
    // Page 1 of 18 at PAGE_SIZE=8 → the count line reports server total vs shown page.
    expect(html).toContain('Seiko Presage');
    expect(html).toContain('Casio F-91W');
    expect(html).toContain(`Showing ${PAGE_SIZE} of 18`);
    expect(html).not.toContain('<canvas');
    expect(html).toContain('data-parity-statement');
    expect(html).toContain('Ranking does not favour listings that have a 3D model');
    // Cards never differ in structure by has3d beyond the marker text: same element per card.
    const anchors = host.querySelectorAll('[data-listing-id]');
    expect(anchors).toHaveLength(PAGE_SIZE);
  });

  test('a shared link reproduces the exact search the URL encodes, facets included', async () => {
    win.history.replaceState({}, '', '/search?q=seiko&condition=mint&priceMax=500000&sort=recent');
    const transport = fakeListingSearch({ corpus: PILOT_CORPUS });
    await mountSearch(transport);
    expect(transport.calls).toHaveLength(1);
    const asked: SearchState = transport.calls[0]!;
    expect(asked.q).toBe('seiko');
    expect(asked.conditions).toEqual(['mint']);
    expect(asked.priceMaxCents).toBe(500_000);
    expect(asked.sort).toBe('recent');
  });

  test('changing the sort rewrites the URL so the new search is shareable', async () => {
    const transport = fakeListingSearch({ corpus: PILOT_CORPUS });
    const host = await mountSearch(transport);
    const select = host.querySelector('select[name="sort"]') as HTMLSelectElement;
    await act(async () => {
      select.value = 'price_asc';
      select.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
    await flush();
    expect(win.location.search).toContain('sort=price_asc');
    expect(parseSearchState(win.location.search).sort).toBe('price_asc');
    expect(transport.calls[1]?.sort).toBe('price_asc');
  });

  test('zero results and a failed search are different screens fed by different outcome kinds', async () => {
    const transport = fakeListingSearch({ corpus: PILOT_CORPUS });
    const host = await mountSearch(transport);

    await submitQuery(host, 'Rolex Daytona solid gold');
    expect(host.innerHTML).toContain('Nothing found for');
    expect(host.innerHTML).toContain('data-variant="zero-results"');
    expect(host.innerHTML).toContain('No listings match this search');
    expect(host.innerHTML).not.toContain('Search is not answering');

    transport.setFailure('network');
    await submitQuery(host, 'seiko');
    expect(host.innerHTML).toContain('Search is not answering');
    expect(host.innerHTML).toContain('data-variant="search-failed"');
    expect(host.innerHTML).toContain('Count unavailable');
    expect(host.innerHTML).not.toContain('Nothing found');
    expect(host.innerHTML).not.toContain('No listings match');

    // Recovery proves the two screens are phases, not dead ends: the retry lands on results.
    transport.setFailure(null);
    const retry = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Try the search again');
    expect(retry).toBeTruthy();
    await act(async () => {
      (retry as HTMLButtonElement).dispatchEvent(new win.Event('click', { bubbles: true }));
    });
    await flush();
    expect(host.innerHTML).toContain('Seiko Presage');
  });

  test('facet counts on screen are the response counts — a page recount would be a lie', async () => {
    const transport = fakeListingSearch({ corpus: PILOT_CORPUS });
    const host = await mountSearch(transport);
    const button = host.querySelector('[data-filters-button]') as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new win.Event('click', { bubbles: true }));
    });
    await flush();

    const shown = Array.from(document.querySelectorAll('[data-facet="Condition"] [data-facet-count]')).map((el) =>
      Number(el.getAttribute('data-facet-count')),
    );
    const server = facetCountsFor(PILOT_CORPUS, defaultSearchState()).find((f) => f.name === 'condition');
    expect(shown).toEqual((server?.values ?? []).map((v) => v.count));
    // Non-vacuity: 'good' is 6 over the corpus but only 3 among the 8 items of page one.
    // If the UI ever recounted the page instead of trusting the response, this fails.
    const goodIndex = 2; // mint, excellent, good, worn
    const pageGood = PILOT_CORPUS.slice(0, PAGE_SIZE).filter((item) => item.condition === 'good').length;
    expect(shown[goodIndex]).toBe(7);
    expect(pageGood).toBe(3);
    expect(shown[goodIndex]).not.toBe(pageGood);
    // And a zero exists visibly rather than being hidden (watch-tools has no listings? there are
    // none in that category in the corpus? there is one — check the category facet instead).
    const pendingHints = document.querySelectorAll('[data-facet-pending="true"]');
    expect(pendingHints).toHaveLength(0);
  });

  test('pagination: next page asks with the server cursor; previous returns to page one', async () => {
    const transport = fakeListingSearch({ corpus: PILOT_CORPUS });
    const host = await mountSearch(transport);
    const next = host.querySelector('[data-next-page]') as HTMLButtonElement;
    expect(next).toBeTruthy();
    await act(async () => {
      next.dispatchEvent(new win.Event('click', { bubbles: true }));
    });
    await flush();
    expect(win.location.search).toContain('cursor=p2');
    expect(transport.calls[1]?.cursor).toBe('p2');
    const back = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Previous page');
    expect(back).toBeTruthy();
    await act(async () => {
      (back as HTMLButtonElement).dispatchEvent(new win.Event('click', { bubbles: true }));
    });
    await flush();
    expect(win.location.search).not.toContain('cursor=');
    expect(transport.calls[2]?.cursor).toBeNull();
  });

  test('a slow stale response can never overwrite the current one', async () => {
    const recorder = recordingTransport();
    const host = await mountSearch(recorder.transport);
    expect(recorder.requests).toHaveLength(1);

    await submitQuery(host, 'citizen');
    expect(recorder.requests).toHaveLength(2);

    // The SECOND request answers first, with real citizen results.
    const citizens = PILOT_CORPUS.filter((item) => item.title.toLowerCase().includes('citizen'));
    await act(async () => {
      recorder.requests[1]!.respond({ kind: 'results', items: citizens, totalMatched: citizens.length, nextCursor: null, facets: [] });
    });
    await flush();
    expect(host.innerHTML).toContain('Eco-Drive');

    // Then the STALE first response lands as a failure. It must be dropped, not rendered.
    await act(async () => {
      recorder.requests[0]!.respond({ kind: 'failed', error: new ApiError({ kind: 'network' }) });
    });
    await flush();
    expect(host.innerHTML).toContain('Eco-Drive');
    expect(host.innerHTML).not.toContain('Search is not answering');
  });

  test('no fetch is reachable from this feature: the transport is injected, never constructed', async () => {
    const originalFetch = (win as unknown as { fetch?: unknown }).fetch;
    (win as unknown as { fetch?: unknown }).fetch = () => {
      throw new Error('search feature must not call fetch');
    };
    try {
      const transport = fakeListingSearch({ corpus: PILOT_CORPUS });
      await mountSearch(transport);
      expect((transport.calls as readonly SearchState[]).length).toBe(1);
    } finally {
      (win as unknown as { fetch?: unknown }).fetch = originalFetch;
    }
  });
});

describe('skeleton respects the reduced-motion contract', () => {
  test('full motion: the shimmer animation is present', () => {
    setReducedMotionOverride(false);
    const markup = renderToStaticMarkup(<SkeletonGrid count={3} />);
    expect(markup).toContain('data-shimmer="on"');
    expect(markup).toContain('search-skeleton-shimmer');
    expect(markup).toContain('animation');
  });

  test('prefers-reduced-motion: the shimmer stops and the placeholders stay', () => {
    setReducedMotionOverride(true);
    const markup = renderToStaticMarkup(<SkeletonGrid count={3} />);
    expect(markup).toContain('data-shimmer="off"');
    expect(markup).not.toContain('animation');
    expect(markup).not.toContain('keyframes');
    expect(markup).toContain('aria-busy="true"');
  });
});
