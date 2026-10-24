import type { SearchFacet, SearchFacetValue } from '@nastech/api-client';
import type { VerificationTier } from '@nastech/api-contracts';
import {
  CONDITION_LABELS,
  PILOT_CATEGORIES,
  PILOT_LOCATIONS,
  categoryLabel,
  defaultSearchState,
  isConditionGrade,
  locationLabel,
} from '../types.js';
import type { ConditionGrade, MultiFacetName, SearchState } from '../types.js';

/**
 * Pure facet-state algebra. Components below it only render; every mutation of a search's
 * facet selection goes through these functions so "changing a facet resets the cursor" is a
 * rule that exists in one place, not one per checkbox.
 */

export type { SearchFacet, SearchFacetValue };

const LIST_KEY_BY_FACET: Record<MultiFacetName, 'conditions' | 'tiers' | 'categories' | 'locations'> = {
  condition: 'conditions',
  sellerTier: 'tiers',
  category: 'categories',
  location: 'locations',
};

export function facetSelection(state: SearchState, name: MultiFacetName): readonly string[] {
  switch (name) {
    case 'condition':
      return state.conditions;
    case 'sellerTier':
      return state.tiers;
    case 'category':
      return state.categories;
    case 'location':
      return state.locations;
  }
}

/**
 * A facet change invalidates every cursor: page 3 of "mint + Sandton" is not page 3 of "mint".
 * Dropping back to the first page here is the whole bug class of "buyer ticked a box and saw
 * an empty list", fixed structurally instead of per call site.
 */
export function toggleFacet(state: SearchState, name: MultiFacetName, value: string): SearchState {
  const current = facetSelection(state, name);
  const next = current.includes(value)
    ? current.filter((existing) => existing !== value)
    : [...current, value];
  const base = { ...state, cursor: null };
  switch (name) {
    case 'condition':
      return { ...base, conditions: next.filter(isConditionGrade) as readonly ConditionGrade[] };
    case 'sellerTier':
      return { ...base, tiers: next as readonly VerificationTier[] };
    case 'category':
      return { ...base, categories: next };
    case 'location':
      return { ...base, locations: next };
  }
}

export function setPriceRange(
  state: SearchState,
  minCents: number | null,
  maxCents: number | null,
): SearchState {
  return { ...state, priceMinCents: minCents, priceMaxCents: maxCents, cursor: null };
}

export function clearAllFacets(state: SearchState): SearchState {
  const defaults = defaultSearchState();
  return {
    ...defaults,
    q: state.q,
    sort: state.sort,
  };
}

export function hasActiveFilters(state: SearchState): boolean {
  return (
    state.priceMinCents !== null ||
    state.priceMaxCents !== null ||
    state.conditions.length > 0 ||
    state.tiers.length > 0 ||
    state.categories.length > 0 ||
    state.locations.length > 0
  );
}

export function activeFacetCount(state: SearchState): number {
  return (
    state.conditions.length +
    state.tiers.length +
    state.categories.length +
    state.locations.length +
    (state.priceMinCents !== null || state.priceMaxCents !== null ? 1 : 0)
  );
}

/** Human summary of what is filtering, for chips and the zero-result screen. */
export function describeActiveFilters(state: SearchState): readonly string[] {
  const out: string[] = [];
  for (const value of state.conditions) out.push(CONDITION_LABELS[value] ?? value);
  for (const value of state.tiers) out.push(`Tier ${value}`);
  for (const value of state.categories) out.push(categoryLabel(value));
  for (const value of state.locations) out.push(locationLabel(value));
  if (state.priceMinCents !== null || state.priceMaxCents !== null) {
    out.push('price range');
  }
  return out;
}

/**
 * Counts come from the response and nowhere else. A facet the response has not answered for
 * yields `null` — the UI must render "counts arrive with the results", never a local recount,
 * because a local recount of the *page* (8 items) as if it were the *corpus* is the lie this
 * rule exists to stop.
 */
export function valuesFor(
  facets: readonly SearchFacet[],
  name: MultiFacetName,
): readonly SearchFacetValue[] | null {
  const facet = facets.find((entry) => entry.name === name);
  return facet === undefined ? null : facet.values;
}

export function countFor(
  facets: readonly SearchFacet[],
  name: MultiFacetName,
  value: string,
): number | null {
  const values = valuesFor(facets, name);
  if (values === null) return null;
  const entry = values.find((candidate) => candidate.value === value);
  return entry === undefined ? null : entry.count;
}

export { PILOT_CATEGORIES, PILOT_LOCATIONS };
