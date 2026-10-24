import type { ListingSummary, VerificationTier } from '@nastech/api-contracts';

/**
 * CONTRACT-GAP: `@nastech/api-contracts` `ListingSummary` is the minimal card payload and knows
 * nothing about the vocabulary search facets need in the pilot: a condition grade, a location, a
 * posting date. These local types are honest stand-ins until the contract grows the fields;
 * nothing here re-declares a tier label, a claim scope, or a budget number — those stay imported.
 */

export type ConditionGrade = 'mint' | 'excellent' | 'good' | 'worn';

export const CONDITION_LABELS: Readonly<Record<ConditionGrade, string>> = {
  mint: 'Mint',
  excellent: 'Excellent',
  good: 'Good',
  worn: 'Well-worn',
};

const CONDITION_KEYS: Readonly<Record<string, string | undefined>> = CONDITION_LABELS;

export function isConditionGrade(value: string): value is ConditionGrade {
  return CONDITION_KEYS[value] !== undefined;
}

/**
 * The search result item: the wire summary plus the pilot's facet fields, all optional so the
 * api-contracts wire shape (which lacks them) stays structurally assignable until the contract
 * catches up.
 */
export interface SearchListing extends ListingSummary {
  readonly condition?: ConditionGrade;
  readonly locationSlug?: string;
  /** ISO-8601. Ranking parses it once; absent means "oldest possible", never a guess at recency. */
  readonly postedAt?: string;
}

export type SortKey = 'relevance' | 'price_asc' | 'price_desc' | 'recent';

const SORT_LABELS: Readonly<Record<string, string | undefined>> = {
  relevance: 'Most relevant',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  recent: 'Newest first',
};

export const SORT_OPTIONS: readonly Readonly<{ value: SortKey; label: string }>[] = (
  ['relevance', 'price_asc', 'price_desc', 'recent'] as const
).map((value) => ({ value, label: SORT_LABELS[value] as string }));

export function isSortKey(value: string): value is SortKey {
  return SORT_LABELS[value] !== undefined;
}

/** Pilot supply vocabulary: one city (Johannesburg), watches and watch things. */
export const PILOT_CATEGORIES: Readonly<Record<string, string>> = {
  'pre-owned-watches': 'Pre-owned watches',
  'pocket-watches': 'Pocket watches',
  'watch-straps': 'Watch straps',
  'watch-tools': 'Watch tools',
  clocks: 'Clocks',
};

export const PILOT_LOCATIONS: Readonly<Record<string, string>> = {
  sandton: 'Sandton',
  rosebank: 'Rosebank',
  fourways: 'Fourways',
  randburg: 'Randburg',
  melville: 'Melville',
};

export function categoryLabel(slug: string): string {
  return PILOT_CATEGORIES[slug] ?? slug.replace(/-/g, ' ');
}

export function locationLabel(slug: string): string {
  return PILOT_LOCATIONS[slug] ?? slug.replace(/-/g, ' ');
}

/** Facets whose selection is a set of values; price is a range and lives beside them. */
export const MULTI_FACET_NAMES = ['condition', 'sellerTier', 'category', 'location'] as const;
export type MultiFacetName = (typeof MULTI_FACET_NAMES)[number];

/** The complete shareable search state. Everything a buyer sees is derivable from this. */
export interface SearchState {
  readonly q: string;
  readonly sort: SortKey;
  readonly priceMinCents: number | null;
  readonly priceMaxCents: number | null;
  readonly conditions: readonly ConditionGrade[];
  readonly tiers: readonly VerificationTier[];
  readonly categories: readonly string[];
  readonly locations: readonly string[];
  readonly cursor: string | null;
}

export function defaultSearchState(): SearchState {
  return {
    q: '',
    sort: 'relevance',
    priceMinCents: null,
    priceMaxCents: null,
    conditions: [],
    tiers: [],
    categories: [],
    locations: [],
    cursor: null,
  };
}
