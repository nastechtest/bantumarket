import { describe, expect, test } from 'bun:test';
import { PILOT_CORPUS } from './api/fixtures.js';
import type { SearchListing } from './types.js';
import { orderKey, rank, withHas3dBlinded } from './ranking/parity.js';
import type { RankOptions } from './ranking/rank.js';

/**
 * THE PARITY PROOF (07 §6.4: no ranking, badge or layout weight favours 3D listings).
 *
 * Structure of the argument, all against one fixed corpus:
 *  1. Invariance: permuting `has3d` across the corpus — rotation and full flip — must leave the
 *     ranked id sequence *byte-identical* under every sort. Not "similar order": identical.
 *  2. Blinding: rank runs over items wrapped in a Proxy that throws the moment `has3d` is read.
 *     A ranker that favoured 3D would not produce a wrong order we could notice — it would
 *     crash here, today, in review.
 *  3. Non-vacuity: the same permutation technique applied to `price` and to `postedAt` must
 *     CHANGE the order. If it did not, the invariance test would be proving that `rank`
 *     ignores everything, and an order-blind ranker is a bug, not a pass.
 */

const NOW = Date.parse('2026-10-22T00:00:00Z');
const SORTS: readonly RankOptions['sort'][] = ['relevance', 'price_asc', 'price_desc', 'recent'];

const bytes = (items: readonly SearchListing[]): string =>
  JSON.stringify(items.map((item) => item.id));

function rotateHas3d(items: readonly SearchListing[], shift: number): SearchListing[] {
  const n = items.length;
  return items.map((item, index) => ({ ...item, has3d: items[(index + shift) % n]?.has3d ?? false }));
}

function flipHas3d(items: readonly SearchListing[]): SearchListing[] {
  return items.map((item) => ({ ...item, has3d: !item.has3d }));
}

function swapField<K extends keyof SearchListing>(
  items: readonly SearchListing[],
  idA: string,
  idB: string,
  field: K,
): SearchListing[] {
  const a = items.find((item) => item.id === idA);
  const b = items.find((item) => item.id === idB);
  if (a === undefined || b === undefined) throw new Error(`swap targets missing: ${idA}, ${idB}`);
  return items.map((item) => {
    if (item.id === idA) return { ...item, [field]: b[field] } as SearchListing;
    if (item.id === idB) return { ...item, [field]: a[field] } as SearchListing;
    return item;
  });
}

describe('parity: rank is invariant to has3d', () => {
  test('the corpus is non-degenerate: mixed has3d and at least three distinct orderings across sorts', () => {
    const flags = new Set(PILOT_CORPUS.map((item) => item.has3d));
    expect(flags.size).toBe(2);
    const keys = new Set(SORTS.map((sort) => bytes(rank(PILOT_CORPUS, { sort, query: '', nowMs: NOW }))));
    expect(keys.size).toBeGreaterThanOrEqual(3);
  });

  for (const sort of SORTS) {
    test(`rotating the has3d assignment keeps the byte-identical order (${sort})`, () => {
      const baseline = rank(PILOT_CORPUS, { sort, query: '', nowMs: NOW });
      for (const shift of [1, 5, PILOT_CORPUS.length - 1]) {
        const rotated = rotateHas3d(PILOT_CORPUS, shift);
        // The permutation really moved at least one flag — otherwise the assertion below is vacuous.
        expect(rotated.map((item) => item.has3d)).not.toEqual(PILOT_CORPUS.map((item) => item.has3d));
        const ranked = rank(rotated, { sort, query: '', nowMs: NOW });
        expect(bytes(ranked)).toBe(bytes(baseline));
      }
    });

    test(`flipping every has3d flag keeps the byte-identical order (${sort})`, () => {
      const baseline = bytes(rank(PILOT_CORPUS, { sort, query: '', nowMs: NOW }));
      expect(bytes(rank(flipHas3d(PILOT_CORPUS), { sort, query: '', nowMs: NOW }))).toBe(baseline);
    });

    test(`a ranker that read has3d would throw under the blinding proxy (${sort})`, () => {
      const blinded = withHas3dBlinded(PILOT_CORPUS);
      const ranked = rank(blinded, { sort, query: 'seiko', nowMs: NOW });
      expect(ranked.length).toBe(PILOT_CORPUS.length);
    });
  }

  test('query relevance is also has3d-blind', () => {
    const opts: RankOptions = { sort: 'relevance', query: 'seiko diver', nowMs: NOW };
    expect(bytes(rank(rotateHas3d(PILOT_CORPUS, 7), opts))).toBe(bytes(rank(PILOT_CORPUS, opts)));
    expect(bytes(rank(flipHas3d(PILOT_CORPUS), opts))).toBe(bytes(rank(PILOT_CORPUS, opts)));
  });

  test('rank is order-insensitive over content: shuffled input yields the same output', () => {
    const shuffled = [...PILOT_CORPUS].reverse();
    const opts: RankOptions = { sort: 'relevance', query: 'watch', nowMs: NOW };
    expect(orderKey(rank(shuffled, opts))).toBe(orderKey(rank(PILOT_CORPUS, opts)));
  });
});

describe('parity: the proof is not vacuous', () => {
  test('price permutes the order under price sorts (rank DOES see price)', () => {
    const ordered = rank(PILOT_CORPUS, { sort: 'price_asc', nowMs: NOW });
    const cheapest = ordered[0]!;
    const dearest = ordered[ordered.length - 1]!;
    expect(cheapest.price.cents).not.toBe(dearest.price.cents);
    const swapped = swapField(PILOT_CORPUS, cheapest.id, dearest.id, 'price');
    expect(bytes(rank(swapped, { sort: 'price_asc', nowMs: NOW }))).not.toBe(bytes(ordered));
    expect(bytes(rank(swapped, { sort: 'price_desc', nowMs: NOW }))).not.toBe(
      bytes(rank(PILOT_CORPUS, { sort: 'price_desc', nowMs: NOW })),
    );
  });

  test('recency permutes the order under recent and relevance (rank DOES see postedAt)', () => {
    const ordered = rank(PILOT_CORPUS, { sort: 'recent', nowMs: NOW });
    const first = ordered[0]!;
    const last = ordered[ordered.length - 1]!;
    expect(first.postedAt).not.toBe(last.postedAt);
    const swapped = swapField(PILOT_CORPUS, first.id, last.id, 'postedAt');
    expect(bytes(rank(swapped, { sort: 'recent', nowMs: NOW }))).not.toBe(bytes(ordered));
    expect(
      bytes(rank(swapped, { sort: 'relevance', query: '', nowMs: NOW })),
    ).not.toBe(bytes(rank(PILOT_CORPUS, { sort: 'relevance', query: '', nowMs: NOW })));
  });

  test('rank does not mutate its input and returns a permutation of it', () => {
    const before = bytes(PILOT_CORPUS);
    const snapshot = [...PILOT_CORPUS];
    const ranked = rank(PILOT_CORPUS, { sort: 'price_asc', nowMs: NOW });
    expect(bytes(PILOT_CORPUS)).toBe(before);
    expect(PILOT_CORPUS.map((item) => item.id)).toEqual(snapshot.map((item) => item.id));
    expect(ranked.map((item) => item.id).sort()).toEqual(PILOT_CORPUS.map((item) => item.id).sort());
  });
});
