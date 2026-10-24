import { TIER_LABELS } from '@nastech/api-contracts';
import type { VerificationTier } from '@nastech/api-contracts';
import {
  defaultSearchState,
  isConditionGrade,
  isSortKey,
} from './types.js';
import type { ConditionGrade, SearchState } from './types.js';

/**
 * Query state lives in the URL: a shared link reproduces a search exactly, facets included.
 *
 * Two rules this file exists to hold:
 *  1. Serialisation drops defaults, so a plain search stays a short, linkable `?q=seiko`, and
 *     multi-value selections are emitted in sorted order — click order must not change the URL,
 *     or two people share two different searches that mean the same thing.
 *  2. Parsing is hostile-tolerant. A buyer (or a scraper, or a corrupted forward) can hand us
 *     `?sort=favicon&condition=fjord`; we drop what we cannot honour rather than crash or
 *     send it on to the server as if it were real.
 */

const TIER_KEYS = Object.keys(TIER_LABELS);

function isVerificationTierValue(value: string): value is VerificationTier {
  return TIER_KEYS.includes(value);
}

function cleanQuery(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function parseCents(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Accepts both canonical repeated params (`condition=a&condition=b`) and comma-joined ones. */
function parseMulti<T extends string>(params: URLSearchParams, key: string, guard: (v: string) => v is T): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const raw of params.getAll(key)) {
    for (const piece of raw.split(',')) {
      const value = piece.trim();
      if (value === '' || seen.has(value) || !guard(value)) continue;
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function paramsFrom(input: string | URLSearchParams): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  const trimmed = input.startsWith('?') ? input.slice(1) : input;
  return new URLSearchParams(trimmed);
}

export function parseSearchState(input: string | URLSearchParams): SearchState {
  const params = paramsFrom(input);
  const base = defaultSearchState();
  const sortRaw = params.get('sort');
  const cursor = params.get('cursor');
  return {
    q: cleanQuery(params.get('q') ?? ''),
    sort: sortRaw !== null && isSortKey(sortRaw) ? sortRaw : base.sort,
    priceMinCents: parseCents(params.get('priceMin')),
    priceMaxCents: parseCents(params.get('priceMax')),
    conditions: parseMulti<ConditionGrade>(params, 'condition', isConditionGrade),
    tiers: parseMulti<VerificationTier>(params, 'sellerTier', isVerificationTierValue),
    categories: parseMulti<string>(params, 'category', (v): v is string => v.length > 0 && v.length <= 64),
    locations: parseMulti<string>(params, 'location', (v): v is string => v.length > 0 && v.length <= 64),
    cursor: cursor !== null && cursor.length > 0 && cursor.length <= 32 ? cursor : null,
  };
}

export function stateToParams(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q !== '') params.set('q', state.q);
  if (state.sort !== 'relevance') params.set('sort', state.sort);
  if (state.priceMinCents !== null) params.set('priceMin', String(state.priceMinCents));
  if (state.priceMaxCents !== null) params.set('priceMax', String(state.priceMaxCents));
  // Sorted emission: the URL is the shareable identity of the search, so it must not depend
  // on the order the buyer ticked boxes.
  const sorted = (values: readonly string[]): readonly string[] => [...values].sort();
  for (const value of sorted(state.conditions)) params.append('condition', value);
  for (const value of sorted(state.tiers)) params.append('sellerTier', value);
  for (const value of sorted(state.categories)) params.append('category', value);
  for (const value of sorted(state.locations)) params.append('location', value);
  if (state.cursor !== null) params.set('cursor', state.cursor);
  return params;
}

/** '' when the state is the default, else '?…' — safe to append straight to a pathname. */
export function stateToSearch(state: SearchState): string {
  const serialized = stateToParams(state).toString();
  return serialized === '' ? '' : `?${serialized}`;
}

export function isDefaultState(state: SearchState): boolean {
  return stateToSearch(state) === '';
}
