import { TIER_LABELS, money } from '@nastech/api-contracts';
import type { VerificationTier } from '@nastech/api-contracts';
import { ApiError } from '@nastech/api-client';
import type { ApiErrorKind, SearchFacet } from '@nastech/api-client';
import {
  CONDITION_LABELS,
  PILOT_CATEGORIES,
  PILOT_LOCATIONS,
} from '../types.js';
import type { ConditionGrade, SearchListing, SearchState } from '../types.js';
import { cursorForPage, decodePageCursor } from '../pagination.js';
import type { ListingSearchOutcome, ListingSearchTransport } from './search-transport.js';

/**
 * Dev/test fixtures for the pilot. There is no HTTP server (ADR 0002), so the fake transport
 * below is what the app actually runs against today; it implements the same
 * `ListingSearchTransport` interface the production adapter will, which is the only way this
 * screen can be honest about "index down" without an index.
 */

interface Row {
  readonly id: string;
  readonly title: string;
  readonly cents: number;
  readonly category: string;
  readonly tier: VerificationTier;
  readonly has3d: boolean;
  readonly condition: ConditionGrade;
  readonly location: string;
  readonly posted: string;
}

const ROWS: readonly Row[] = [
  { id: 'w01', title: 'Seiko Presage “Wave” automatic, 40.5 mm', cents: 420_000, category: 'pre-owned-watches', tier: 'T4', has3d: true, condition: 'excellent', location: 'sandton', posted: '2026-10-18T08:00:00Z' },
  { id: 'w02', title: 'Casio F-91W, boxed, barely worn', cents: 45_000, category: 'pre-owned-watches', tier: 'T2', has3d: false, condition: 'good', location: 'melville', posted: '2026-09-02T14:30:00Z' },
  { id: 'w03', title: 'Citizen Eco-Drive titanium', cents: 310_000, category: 'pre-owned-watches', tier: 'T3', has3d: true, condition: 'mint', location: 'rosebank', posted: '2026-10-01T09:00:00Z' },
  { id: 'w04', title: 'Swatch Irony chronograph', cents: 95_000, category: 'pre-owned-watches', tier: 'T1', has3d: false, condition: 'worn', location: 'fourways', posted: '2026-06-11T17:00:00Z' },
  { id: 'w05', title: 'Orient Bambino dress watch, 41 mm', cents: 210_000, category: 'pre-owned-watches', tier: 'T3', has3d: true, condition: 'excellent', location: 'sandton', posted: '2026-08-20T11:00:00Z' },
  { id: 'w06', title: 'Hamilton Khaki Field mechanical', cents: 520_000, category: 'pre-owned-watches', tier: 'T4', has3d: false, condition: 'good', location: 'randburg', posted: '2026-10-15T07:00:00Z' },
  { id: 'w07', title: 'Seiko 5 Sports “SMK”, service history', cents: 180_000, category: 'pre-owned-watches', tier: 'T2', has3d: true, condition: 'good', location: 'melville', posted: '2026-07-04T19:00:00Z' },
  { id: 'w08', title: 'Tissot PRX powermatic 80', cents: 640_000, category: 'pre-owned-watches', tier: 'T5', has3d: true, condition: 'mint', location: 'sandton', posted: '2026-10-20T10:00:00Z' },
  { id: 'w09', title: 'Casio G-Shock DW-5600, field-worn', cents: 70_000, category: 'pre-owned-watches', tier: 'T1', has3d: false, condition: 'worn', location: 'fourways', posted: '2026-05-30T12:00:00Z' },
  { id: 'w10', title: 'Citizen Promaster diver, automatic', cents: 480_000, category: 'pre-owned-watches', tier: 'T3', has3d: false, condition: 'excellent', location: 'rosebank', posted: '2026-09-25T16:00:00Z' },
  { id: 'w11', title: 'Pocket watch, silver case, key included', cents: 260_000, category: 'pocket-watches', tier: 'T2', has3d: true, condition: 'good', location: 'randburg', posted: '2026-04-14T09:00:00Z' },
  { id: 'w12', title: 'Leather watch straps, lot of four', cents: 32_000, category: 'watch-straps', tier: 'T1', has3d: false, condition: 'good', location: 'melville', posted: '2026-08-08T08:00:00Z' },
  { id: 'w13', title: 'NATO straps, three sizes', cents: 21_000, category: 'watch-straps', tier: 'T2', has3d: true, condition: 'mint', location: 'fourways', posted: '2026-10-11T13:00:00Z' },
  { id: 'w14', title: 'Case back opener and spring-bar tool set', cents: 14_500, category: 'watch-tools', tier: 'T1', has3d: false, condition: 'worn', location: 'sandton', posted: '2026-03-22T10:00:00Z' },
  { id: 'w15', title: 'Seiko SKX diver, original bezel', cents: 390_000, category: 'pre-owned-watches', tier: 'T4', has3d: true, condition: 'excellent', location: 'rosebank', posted: '2026-09-14T15:00:00Z' },
  { id: 'w16', title: 'Swatch Art Special, vintage box', cents: 120_000, category: 'pre-owned-watches', tier: 'T2', has3d: false, condition: 'good', location: 'randburg', posted: '2026-06-28T18:00:00Z' },
  { id: 'w17', title: 'Omega Seamaster quartz, 1990s', cents: 1_450_000, category: 'pre-owned-watches', tier: 'T5', has3d: true, condition: 'good', location: 'sandton', posted: '2026-10-19T09:30:00Z' },
  { id: 'w18', title: 'Mantel clock, runs, one key', cents: 350_000, category: 'clocks', tier: 'T3', has3d: false, condition: 'worn', location: 'melville', posted: '2026-02-10T09:00:00Z' },
];

export const PILOT_CORPUS: readonly SearchListing[] = ROWS.map((row) => ({
  id: row.id,
  title: row.title,
  price: money(row.cents),
  categorySlug: row.category,
  sellerTier: row.tier,
  has3d: row.has3d,
  posterUrl: `/fixtures/posters/${row.id}.jpg`,
  condition: row.condition,
  locationSlug: row.location,
  postedAt: row.posted,
}));

function haystack(item: SearchListing): string {
  const parts = [item.title, item.categorySlug];
  if (item.condition !== undefined) parts.push(CONDITION_LABELS[item.condition]);
  if (item.locationSlug !== undefined) parts.push(item.locationSlug);
  return parts.join(' ').toLowerCase();
}

function matchesQuery(item: SearchListing, query: string): boolean {
  if (query.trim() === '') return true;
  const hay = haystack(item);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token !== '')
    .every((token) => hay.includes(token));
}

function matchesNonFacet(item: SearchListing, state: SearchState): boolean {
  if (!matchesQuery(item, state.q)) return false;
  if (state.priceMinCents !== null && item.price.cents < state.priceMinCents) return false;
  if (state.priceMaxCents !== null && item.price.cents > state.priceMaxCents) return false;
  return true;
}

function matchesFacet(item: SearchListing, name: 'condition' | 'sellerTier' | 'category' | 'location', state: SearchState): boolean {
  switch (name) {
    case 'condition':
      return state.conditions.length === 0 || (item.condition !== undefined && state.conditions.includes(item.condition));
    case 'sellerTier':
      return state.tiers.length === 0 || state.tiers.includes(item.sellerTier);
    case 'category':
      return state.categories.length === 0 || state.categories.includes(item.categorySlug);
    case 'location':
      return state.locations.length === 0 || (item.locationSlug !== undefined && state.locations.includes(item.locationSlug));
  }
}

/**
 * Facet counts, computed the way a facet server must: for facet `F`, over items matching every
 * filter *except* F. That is what lets a checkbox honestly show "3 mint in this price range"
 * while the buyer has nothing selected in mint — and what makes a selected-but-zero value
 * visible as 0 instead of vanishing.
 */
export function facetCountsFor(corpus: readonly SearchListing[], state: SearchState): readonly SearchFacet[] {
  const build = (
    name: 'condition' | 'sellerTier' | 'category' | 'location',
    vocabulary: readonly string[],
    read: (item: SearchListing) => string | undefined,
  ): SearchFacet => {
    // Standard facet semantics: match everything EXCEPT this facet's own selection — otherwise
    // selecting "mint" would zero out every other condition and make the filter un-deselectable.
    const pool = corpus.filter((item) => {
      if (!matchesNonFacet(item, state)) return false;
      for (const other of ['condition', 'sellerTier', 'category', 'location'] as const) {
        if (other === name) continue;
        if (!matchesFacet(item, other, state)) return false;
      }
      return true;
    });
    return {
      name,
      values: vocabulary.map((value) => ({
        value,
        count: pool.filter((item) => read(item) === value).length,
      })),
    };
  };

  return [
    build('condition', Object.keys(CONDITION_LABELS), (item) => item.condition),
    build('sellerTier', Object.keys(TIER_LABELS), (item) => item.sellerTier),
    build('category', Object.keys(PILOT_CATEGORIES), (item) => item.categorySlug),
    build('location', Object.keys(PILOT_LOCATIONS), (item) => item.locationSlug),
  ];
}

export interface FakeListingSearch extends ListingSearchTransport {
  /** Every state the UI asked for, in call order — tests assert the page asked correctly. */
  readonly calls: readonly SearchState[];
  setFailure(kind: ApiErrorKind | null): void;
  reset(): void;
}

/**
 * Deterministic fake. `failure` makes the index answer `failed` (never empty!); nothing in this
 * file throws for transport reasons, because a thrown error is how the two outcome kinds get
 * collapsed back into "empty" in a caller's hands.
 */
export function fakeListingSearch(options: { readonly corpus?: readonly SearchListing[]; readonly delayMs?: number } = {}): FakeListingSearch {
  const corpus = options.corpus ?? PILOT_CORPUS;
  const delayMs = options.delayMs ?? 0;
  let failure: ApiErrorKind | null = null;
  const calls: SearchState[] = [];

  return {
    calls,
    setFailure(kind) {
      failure = kind;
    },
    reset() {
      failure = null;
      calls.length = 0;
    },
    async search({ state, limit }): Promise<ListingSearchOutcome> {
      calls.push(state);
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (failure !== null) {
        return { kind: 'failed', error: new ApiError({ kind: failure }) };
      }
      const facets = facetCountsFor(corpus, state);
      const filtered = corpus.filter((item) => {
        if (!matchesNonFacet(item, state)) return false;
        for (const name of ['condition', 'sellerTier', 'category', 'location'] as const) {
          if (!matchesFacet(item, name, state)) return false;
        }
        return true;
      });
      if (filtered.length === 0) {
        return { kind: 'no_matches', facets };
      }
      const page = decodePageCursor(state.cursor);
      const start = (page - 1) * limit;
      const items = filtered.slice(start, start + limit);
      return {
        kind: 'results',
        items,
        totalMatched: filtered.length,
        nextCursor: start + limit < filtered.length ? cursorForPage(page + 1) : null,
        facets,
      };
    },
  };
}
