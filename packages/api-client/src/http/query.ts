/**
 * Query serialization with the money rule applied at the boundary.
 *
 * Two reasons this is not `new URLSearchParams(obj)`:
 *   - Cache keys and retry comparisons need a deterministic string. Iteration order of an object
 *     built from user input is not it, so keys and array values are sorted.
 *   - A cents-valued parameter must be whole before it leaves the browser. `f.priceMaxCents=12.5`
 *     is not "R12.50"; the field is cents, and a server that receives 12.5 either rejects it or,
 *     worse, stores what `Money::fromCents` refuses to build. `SharedKernel/Money.php` is
 *     `int $cents` — "Money is a value object over integer cents. Never a float." — so the client
 *     holds the same line and rejects rather than rounding.
 */

import { contractViolation } from './errors.js';

export type QueryScalar = string | number | boolean;
export type QueryValue = QueryScalar | readonly QueryScalar[] | null | undefined;

export type QueryInput = Readonly<Record<string, QueryValue>>;

/** Repeated keys are how the wire spells a multi-value facet (`brand=seiko&brand=casio`). */
const MAX_QUERY_LENGTH = 2000;
const CENTS_KEY = /(^|[_a-z])cents$/i;

export function serializeQuery(query: QueryInput | undefined): string {
  if (query === undefined) return '';
  const parts: string[] = [];
  for (const key of Object.keys(query).sort()) {
    const value = query[key];
    if (value === undefined || value === null) continue;
    if (!isQueryScalar(value)) {
      // `Array.isArray` does not narrow a `readonly T[]` union member, so the split is done on what
      // a scalar positively is rather than on what the value might be — no casts needed either way.
      const entries = value;
      if (entries.length === 0) continue;
      // Stable order within a facet: an unordered array would make two identical searches differ
      // in cache key and in the cursor a support agent has to compare.
      for (const entry of [...entries].sort(compareScalars)) {
        parts.push(`${encodeURIComponent(key)}=${encodeParam(key, entry)}`);
      }
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeParam(key, value)}`);
  }
  const joined = parts.join('&');
  if (joined.length > MAX_QUERY_LENGTH) {
    throw contractViolation('invalid_query_value', 'query', `${joined.length} chars`, `a query under ${MAX_QUERY_LENGTH} chars`);
  }
  return joined;
}

/** `Array.isArray` will not narrow a `readonly QueryScalar[]` out of this union, so scalars are named. */
export function isQueryScalar(value: QueryValue): value is QueryScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function compareScalars(a: QueryScalar, b: QueryScalar): number {
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function encodeParam(key: string, value: QueryScalar): string {
  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      throw contractViolation('out_of_range', `query.${key}`, value, 'a finite number');
    }
    if (CENTS_KEY.test(key)) assertIntegralCents(key, value);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return encodeURIComponent(value);
}

/**
 * Reject a fractional cents value with a typed contract violation. Rounding here would misstate
 * money in a filter that the buyer then trusts to be the price range they asked for.
 */
export function assertIntegralCents(key: string, value: number): void {
  if (!Number.isInteger(value)) {
    throw contractViolation('money_precision', `query.${key}`, value, 'whole integer cents');
  }
}

export function joinUrl(baseUrl: string, path: string, query: QueryInput | undefined): string {
  const base = baseUrl.replace(/\/+$/, '');
  const serialised = serializeQuery(query);
  if (serialised === '') return `${base}${path}`;
  const separator = path.includes('?') ? '&' : '?';
  return `${base}${path}${separator}${serialised}`;
}

export interface ParsedQuery {
  readonly scalars: Readonly<Record<string, string>>;
  readonly repeated: Readonly<Record<string, readonly string[]>>;
}

/** For round-tripping a URL back into state (the search feature's `url-state.ts` needs this). */
export function parseQuery(search: string): ParsedQuery {
  const scalars: Record<string, string> = {};
  const repeated: Record<string, string[]> = {};
  if (search === '') return { scalars, repeated };
  const trimmed = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of trimmed.split('&')) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    const key = decodeURIComponent(rawKey);
    const value = decodeURIComponent(rawValue);
    const existing = repeated[key];
    if (existing === undefined) {
      repeated[key] = [value];
      scalars[key] = value;
    } else {
      existing.push(value);
      // Once a key repeats, the scalar reading is ambiguous and must not be offered.
      delete scalars[key];
    }
  }
  return { scalars, repeated };
}

/** A cache key that is stable for the same semantic request and different for a different one. */
export function requestCacheKey(method: string, path: string, query: QueryInput | undefined): string {
  return `${method.toUpperCase()} ${path}?${serializeQuery(query)}`;
}
