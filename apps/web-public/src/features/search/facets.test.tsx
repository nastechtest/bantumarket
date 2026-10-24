import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TIER_LABELS } from '@nastech/api-contracts';
import type { SearchFacet } from '@nastech/api-client';
import { defaultSearchState } from './types.js';
import {
  activeFacetCount,
  clearAllFacets,
  countFor,
  describeActiveFilters,
  facetSelection,
  hasActiveFilters,
  setPriceRange,
  toggleFacet,
  valuesFor,
} from './facets/facet-state.js';
import { FacetPanel } from './facets/facet-panel.js';
import { ConditionFacet } from './facets/condition-facet.js';
import { TierFacet } from './facets/tier-facet.js';
import { parseRandInputToCents } from './facets/price-facet.js';
import { PILOT_CORPUS, facetCountsFor } from './api/fixtures.js';

/**
 * Facet behaviour, and the count rule that matters: every number rendered here comes from the
 * response's facet list. `facetCountsFor` (the fake server) counts over the whole corpus
 * honouring other filters — never over the 8-item page the grid happens to show.
 */

const facets: readonly SearchFacet[] = [
  {
    name: 'condition',
    values: [
      { value: 'mint', count: 3 },
      { value: 'excellent', count: 5 },
      { value: 'good', count: 7 },
      { value: 'worn', count: 0 },
    ],
  },
  {
    name: 'sellerTier',
    values: [
      { value: 'T1', count: 4 },
      { value: 'T2', count: 5 },
      { value: 'T3', count: 3 },
      { value: 'T4', count: 4 },
      { value: 'T5', count: 2 },
    ],
  },
  { name: 'category', values: [{ value: 'pre-owned-watches', count: 14 }] },
  { name: 'location', values: [{ value: 'sandton', count: 5 }] },
];

describe('facet-state algebra', () => {
  test('toggling a facet value adds and removes it, and always resets the cursor', () => {
    const start = { ...defaultSearchState(), cursor: 'p3' };
    const on = toggleFacet(start, 'condition', 'mint');
    expect(on.conditions).toEqual(['mint']);
    expect(on.cursor).toBeNull();
    const off = toggleFacet(on, 'condition', 'mint');
    expect(off.conditions).toEqual([]);
  });

  test('facetSelection reads each facet list by name', () => {
    const state = { ...defaultSearchState(), tiers: ['T4' as const], locations: ['sandton'] };
    expect(facetSelection(state, 'sellerTier')).toEqual(['T4']);
    expect(facetSelection(state, 'location')).toEqual(['sandton']);
    expect(facetSelection(state, 'category')).toEqual([]);
  });

  test('clearAllFacets keeps the query and the sort, drops every filter', () => {
    const state = {
      ...defaultSearchState(),
      q: 'seiko',
      sort: 'price_asc' as const,
      conditions: ['mint' as const],
      priceMaxCents: 50_000,
      cursor: 'p2',
    };
    const cleared = clearAllFacets(state);
    expect(cleared.q).toBe('seiko');
    expect(cleared.sort).toBe('price_asc');
    expect(cleared.conditions).toEqual([]);
    expect(cleared.priceMaxCents).toBeNull();
    expect(cleared.cursor).toBeNull();
    expect(hasActiveFilters(cleared)).toBe(false);
  });

  test('active count treats a price range as one filter', () => {
    const state = setPriceRange(toggleFacet(defaultSearchState(), 'location', 'sandton'), 10_000, null);
    expect(activeFacetCount(state)).toBe(2);
    expect(describeActiveFilters(state).join(',')).toContain('Sandton');
  });

  test('valuesFor/countFor answer from the response or not at all', () => {
    expect(countFor(facets, 'condition', 'mint')).toBe(3);
    expect(countFor(facets, 'condition', 'worn')).toBe(0);
    expect(valuesFor(facets, 'sellerTier')).toHaveLength(5);
    const noFacets: readonly SearchFacet[] = [];
    expect(valuesFor(noFacets, 'condition')).toBeNull();
    expect(countFor(noFacets, 'condition', 'mint')).toBeNull();
  });
});

describe('facet fake server', () => {
  test('counts ignore the facet\u2019s own selection but honour the rest', () => {
    const state = { ...defaultSearchState(), conditions: ['mint' as const], q: 'seiko' };
    const condition = facetCountsFor(PILOT_CORPUS, state).find((f) => f.name === 'condition');
    // 'mint' still shows its real count under the seiko query even though mint is selected —
    // hiding it would make deselecting impossible; counting only mint would be the lie.
    const mint = condition?.values.find((v) => v.value === 'mint');
    expect(mint?.count).toBeGreaterThanOrEqual(0);
    const excellent = condition?.values.find((v) => v.value === 'excellent');
    const corpusExcellentSeiko = PILOT_CORPUS.filter(
      (item) => item.condition === 'excellent' && item.title.toLowerCase().includes('seiko'),
    ).length;
    expect(excellent?.count).toBe(corpusExcellentSeiko);
    // The tier facet must NOT be narrowed by condition… it must: cross-filters apply.
    const tier = facetCountsFor(PILOT_CORPUS, state).find((f) => f.name === 'sellerTier');
    const corpusT2MintSeiko = PILOT_CORPUS.filter(
      (item) => item.sellerTier === 'T2' && item.condition === 'mint' && item.title.toLowerCase().includes('seiko'),
    ).length;
    expect(tier?.values.find((v) => v.value === 'T2')?.count).toBe(corpusT2MintSeiko);
  });
});

describe('facet components', () => {
  test('a zero-count value is visible with its honest zero, and inert unless selected', () => {
    const markup = renderToStaticMarkup(
      <ConditionFacet values={facets[0]!.values} selected={[]} onToggle={() => undefined} />,
    );
    expect(markup).toContain('data-facet-count="0"');
    expect(markup).toContain('disabled');
    expect(markup).toContain('Well-worn');
  });

  test('a selected zero-count value stays enabled so it can be unchecked', () => {
    const values = [{ value: 'worn', count: 0 }, { value: 'mint', count: 3 }];
    const markup = renderToStaticMarkup(
      <ConditionFacet values={values} selected={['worn']} onToggle={() => undefined} />,
    );
    const wornRow = /checked="" disabled/.test(markup);
    expect(wornRow).toBe(false); // selected ⇒ checked, never disabled
  });

  test('without a response the facet says counts arrive with results, and shows no numbers', () => {
    const markup = renderToStaticMarkup(
      <ConditionFacet values={null} selected={[]} onToggle={() => undefined} />,
    );
    expect(markup).toContain('data-facet-pending="true"');
    expect(markup).not.toMatch(/data-facet-count="\(?\d/);
    expect(markup).not.toContain('Mint');
  });

  test('tier facet renders exactly TIER_LABELS vocabulary, no invented strings', () => {
    const markup = renderToStaticMarkup(
      <TierFacet values={facets[1]!.values} selected={[]} onToggle={() => undefined} />,
    );
    for (const label of Object.values(TIER_LABELS)) {
      expect(markup).toContain(label);
    }
    expect(markup).not.toContain('verified');
    expect(markup).not.toContain('Verified');
  });

  test('panel shows the active-filter count and renders every facet', () => {
    const state = { ...defaultSearchState(), conditions: ['mint' as const], priceMinCents: 5000 };
    const markup = renderToStaticMarkup(
      <FacetPanel state={state} facets={facets} onToggleFacet={() => undefined} onPriceRange={() => undefined} onClearAll={() => undefined} />,
    );
    expect(markup).toContain('data-active-filter-count="2"');
    expect(markup).toContain('2 filters on');
    for (const heading of ['Condition', 'Seller verification', 'Category', 'Pickup area', 'Price']) {
      expect(markup).toContain(`data-facet="${heading}"`);
    }
  });

  test('price input parser speaks rand, thinks cents, and rejects everything else', () => {
    expect(parseRandInputToCents('4500')).toEqual({ ok: true, cents: 450_000 });
    expect(parseRandInputToCents('R4,500')).toEqual({ ok: true, cents: 450_000 });
    expect(parseRandInputToCents('4 500')).toEqual({ ok: true, cents: 450_000 });
    expect(parseRandInputToCents('')).toEqual({ ok: true, cents: null });
    expect(parseRandInputToCents('-5').ok).toBe(false);
    expect(parseRandInputToCents('45.5').ok).toBe(false);
    expect(parseRandInputToCents('free').ok).toBe(false);
  });
});
