import type { RankOptions, RankSource } from './rank.js';
import { rankItems } from './rank.js';

/**
 * The parity rule (07 §6.4), as an entry point and as tooling that can prove it.
 *
 * `rank` is the only ranking call site in this feature. It is a pure function over the item
 * *content* projection, which contains no `has3d` field, and the proof lives next door in
 * parity.test.ts: a `has3d` shuffle over a fixed corpus must produce a byte-identical ordering,
 * while price and recency shuffles must *change* it (so the proof is not vacuously true of a
 * function that ignores everything).
 */

export const PARITY_STATEMENT =
  'Ranking does not favour listings that have a 3D model. A listing with a model and a listing without one are ranked on the same fields.';

/** The field names the scoring code must never read. The proxy below turns "never" into "throws". */
export const PARITY_FORBIDDEN_FIELDS: readonly string[] = ['has3d'];

export function rank<T extends RankSource>(items: readonly T[], opts: RankOptions): T[] {
  return rankItems(items, opts);
}

/** Byte-comparable ordering key: the ids in ranked order, joined by a character titles cannot contain. */
export function orderKey(items: Iterable<{ readonly id: string }>): string {
  let out = '';
  for (const item of items) out += `${item.id}\u0000`;
  return out;
}

/**
 * Wrap items so reading a forbidden field throws mid-rank. Used by parity.test.ts; exported here
 * because the forbidden-field list and the guard must stay in the same file or they drift apart.
 */
export function withHas3dBlinded<T extends object>(items: readonly T[]): T[] {
  return items.map((item) =>
    new Proxy(item, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && PARITY_FORBIDDEN_FIELDS.includes(prop)) {
          throw new Error(`PARITY VIOLATION: ranking read "${prop}" — 07 §6.4 forbids it as a signal`);
        }
        return Reflect.get(target, prop, receiver);
      },
    }),
  );
}
