import { describe, expect, test } from 'bun:test';
import { defaultSearchState } from './types.js';
import type { SearchState } from './types.js';
import { isDefaultState, parseSearchState, stateToParams, stateToSearch } from './url-state.js';
import { PILOT_CORPUS, fakeListingSearch } from './api/fixtures.js';
import { cursorForPage, decodePageCursor, PAGE_SIZE, trailPop, trailPush } from './pagination.js';

/**
 * URL state is the shareable identity of a search. Round-tripping must be exact including
 * facets, defaults must not bloat the link, and hostile input must degrade to "ignored",
 * never to a crash or a filter nobody asked for.
 */

describe('url-state round trip', () => {
  test('the default state serialises to an empty search string', () => {
    expect(stateToSearch(defaultSearchState())).toBe('');
    expect(isDefaultState(defaultSearchState())).toBe(true);
  });

  test('a full facet state reproduces exactly through the URL', () => {
    const state: SearchState = {
      q: 'seiko presage',
      sort: 'price_desc',
      priceMinCents: 10_000,
      priceMaxCents: 600_000,
      // Sorted arrays because serialisation sorts facet values — click order must not change
      // the link; the round trip is asserted to be the *same state*, so we spell it canonically.
      conditions: ['excellent', 'mint'],
      tiers: ['T3', 'T4'],
      categories: ['pre-owned-watches'],
      locations: ['rosebank', 'sandton'],
      cursor: cursorForPage(2),
    };
    const url = stateToSearch(state);
    expect(parseSearchState(url)).toEqual(state);
  });

  test('click order does not change the URL, so two people share the same search', () => {
    const a: SearchState = { ...defaultSearchState(), conditions: ['mint', 'worn'] };
    const b: SearchState = { ...defaultSearchState(), conditions: ['worn', 'mint'] };
    expect(stateToSearch(a)).toBe(stateToSearch(b));
  });

  test('query whitespace and length are normalised, not smuggled through', () => {
    expect(parseSearchState('?q=' + encodeURIComponent('  lots   of   space ')).q).toBe('lots of space');
    expect(parseSearchState(`?q=${'x'.repeat(400)}`).q.length).toBeLessThanOrEqual(120);
  });

  test('both canonical and comma-joined multi params parse', () => {
    const repeated = parseSearchState('?condition=mint&condition=good');
    const joined = parseSearchState('?condition=mint,good');
    expect(repeated.conditions).toEqual(['mint', 'good']);
    expect(joined.conditions).toEqual(['mint', 'good']);
  });

  test('hostile params are dropped, never honoured', () => {
    const hostile = parseSearchState('?sort=favicon&condition=fjord&sellerTier=T9&priceMin=-5&priceMax=abc');
    expect(hostile.sort).toBe('relevance');
    expect(hostile.conditions).toEqual([]);
    expect(hostile.tiers).toEqual([]);
    expect(hostile.priceMinCents).toBeNull();
    expect(hostile.priceMaxCents).toBeNull();
  });

  test('empty selections do not leak a bare param name into the URL', () => {
    const url = stateToSearch({ ...defaultSearchState(), q: 'seiko' });
    expect(url).toBe('?q=seiko');
    expect(stateToParams(defaultSearchState()).toString()).toBe('');
  });
});

describe('pagination cursors', () => {
  test('page one has no cursor; encodes and decodes are inverse', () => {
    expect(cursorForPage(1)).toBeNull();
    expect(decodePageCursor(null)).toBe(1);
    for (const page of [2, 3, 17]) {
      expect(decodePageCursor(cursorForPage(page))).toBe(page);
    }
  });

  test('junk cursors decode to page one instead of throwing', () => {
    expect(decodePageCursor('p-3')).toBe(1);
    expect(decodePageCursor('page%3D2')).toBe(1);
    expect(decodePageCursor('p999999999999')).toBe(1);
  });

  test('the trail is a LIFO back-stack over immutable arrays', () => {
    let trail = trailPush(trailPush([], null), 'p2');
    expect(trail).toEqual([null, 'p2']);
    const popped = trailPop(trail);
    expect(popped.cursor).toBe('p2');
    expect(trail).toEqual([null, 'p2']); // trailPop did not mutate
    expect(trailPop(popped.rest).cursor).toBe(null);
    expect(trailPop([]).cursor).toBe(null);
  });

  test('PAGE_SIZE is what the fake server slices by', () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
  });
});

describe('shared link reproduces a search end to end', () => {
  test('parse → fake transport → same filtered corpus as the original state', async () => {
    const original: SearchState = {
      ...defaultSearchState(),
      q: 'seiko',
      conditions: ['excellent'],
      locations: ['sandton'],
      sort: 'recent',
    };
    const url = stateToSearch(original);
    const parsed = parseSearchState(url);
    expect(parsed).toEqual(original);

    const transport = fakeListingSearch({ corpus: PILOT_CORPUS });
    const direct = await transport.search({ state: original, limit: PAGE_SIZE });
    const shared = await transport.search({ state: parsed, limit: PAGE_SIZE });
    if (direct.kind !== 'results' || shared.kind !== 'results') {
      throw new Error('fixture corpus must answer this shared search with results');
    }
    expect(shared.items.map((item) => item.id)).toEqual(direct.items.map((item) => item.id));
    expect(shared.totalMatched).toBe(direct.totalMatched);
    expect(shared.items[0]?.id).toBe('w01');
  });
});
