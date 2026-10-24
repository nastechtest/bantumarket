import type { Money, VerificationTier } from '@nastech/api-contracts';
import type { SortKey } from '../types.js';

/**
 * The ranking core, kept separate from parity.ts so the parity proof has something fixed to
 * prove *about*. Everything the comparators read arrives through `RankInput`, and `RankInput`
 * is built by an explicit field-by-field projection in which `has3d` has no name — a scored
 * item cannot favour 3D because "3D-ness" is not a thing the scoring code can address.
 * (07 §6.4: no ranking, badge or layout weight favours 3D listings.)
 */

/** What a rankable item must at most provide; extra fields (has3d included) are ignored, by construction. */
export interface RankSource {
  readonly id: string;
  readonly title: string;
  readonly price: Money;
  readonly sellerTier: VerificationTier;
  readonly categorySlug: string;
  readonly has3d?: boolean;
  readonly condition?: string;
  /** ISO-8601 posting date; unparsable or absent ranks as oldest, never as a recency guess. */
  readonly postedAt?: string;
}

export interface RankOptions {
  readonly sort: SortKey;
  readonly query?: string;
  /** Injectable clock so recency scoring is deterministic in tests. */
  readonly nowMs?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The projection, and the load-bearing comment in this file: `has3d` is never read here.
 * If someone later adds `item.has3d` to score a "rich listing higher", the parity proxy test
 * (parity.test.ts) throws with `has3d` in its face before the code ever ships.
 */
export interface RankInput {
  readonly id: string;
  readonly title: string;
  readonly priceCents: number;
  readonly postedAtMs: number;
  readonly conditionKey: string;
  readonly categorySlug: string;
}

export function projectForRanking(item: RankSource): RankInput {
  const posted = item.postedAt === undefined ? Number.NaN : Date.parse(item.postedAt);
  return {
    id: item.id,
    title: item.title,
    priceCents: item.price.cents,
    postedAtMs: Number.isFinite(posted) ? posted : 0,
    conditionKey: item.condition ?? '',
    categorySlug: item.categorySlug,
  };
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/** Whole-word token overlap plus a phrase bonus. Bounded, integer-valued, no magic multipliers. */
export function textMatchScore(title: string, query: string): number {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return 0;
  const titleTokens = new Set(tokenize(title));
  let score = 0;
  for (const term of tokenize(trimmed)) {
    if (titleTokens.has(term)) score += 10;
  }
  if (title.toLowerCase().includes(trimmed)) score += 25;
  return score;
}

export function recencyBoostMs(ageMs: number): number {
  if (ageMs < 0) return 0;
  if (ageMs <= 7 * DAY_MS) return 12;
  if (ageMs <= 30 * DAY_MS) return 6;
  if (ageMs <= 90 * DAY_MS) return 2;
  return 0;
}

export function relevanceScoreOf(input: RankInput, query: string, nowMs: number): number {
  return textMatchScore(input.title, query) + recencyBoostMs(nowMs - input.postedAtMs);
}

/**
 * Total order, always. The final tiebreak is `id`, not input position, so equal-scoring items
 * cannot shuffle between runs or between a shuffled `has3d` assignment — the ordering is a
 * function of item *content*, which is exactly what the parity proof needs.
 */
export function compareForRanking(
  a: RankInput,
  b: RankInput,
  opts: RankOptions,
  nowMs: number,
  query: string,
): number {
  let by = 0;
  switch (opts.sort) {
    case 'price_asc':
      by = a.priceCents - b.priceCents;
      break;
    case 'price_desc':
      by = b.priceCents - a.priceCents;
      break;
    case 'recent':
      by = b.postedAtMs - a.postedAtMs;
      break;
    case 'relevance':
    default:
      by =
        relevanceScoreOf(b, query, nowMs) - relevanceScoreOf(a, query, nowMs) ||
        b.postedAtMs - a.postedAtMs;
      break;
  }
  if (by !== 0) return by;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function rankItems<T extends RankSource>(items: readonly T[], opts: RankOptions): T[] {
  const nowMs = opts.nowMs ?? Date.now();
  const query = opts.query ?? '';
  const keyed = items.map((item) => ({ item, input: projectForRanking(item) }));
  keyed.sort((x, y) => compareForRanking(x.input, y.input, opts, nowMs, query));
  return keyed.map((entry) => entry.item);
}
