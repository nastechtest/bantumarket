/**
 * Cursors: opaque on the wire, keyset-shaped when this client builds one, and never re-parsed by
 * guesswork.
 *
 * The indexes tell us what pagination is actually possible. `db/migrations/001_money_path.sql` has
 * `orders_by_buyer ON orders (buyer_id, created_at DESC)` and `ledger_by_seller ON ledger_entries
 * (seller_id, recorded_at)` — an ordering plus a trailing `id` tiebreaker, which is keyset
 * pagination and not offset pagination. So a cursor is a `(sort value, id)` pair, and a page two
 * deep costs the same as a page ten thousand deep. An `OFFSET` cursor would be a lie about what the
 * schema can serve cheaply.
 *
 * Two rules that come from being a client rather than a server:
 *   - A cursor from the server is treated as opaque. `catalogue.ts` already passes `nextCursor`
 *     straight back as `cursor`, and that stays correct whatever the server encodes. Decoding is
 *     only for cursors *this* client minted, and a decode failure is a typed error, never a
 *     fallback to page one: silently restarting a scroll at the top shows a buyer a list that looks
 *     loaded and is not.
 *   - Page size is clamped here. `MAX_PAGE_SIZE` is a client guard, not a contract budget:
 *     `packages/api-contracts` declares payload ceilings but no pagination entry (see the
 *     CONTRACT-GAP note below), so the client sets the ceiling the 3G first-paint rule implies and
 *     reports the gap rather than inventing a number in somebody else's file.
 */

// CONTRACT-GAP: `packages/api-contracts` has no pagination vocabulary — no page-size ceiling, no
// cursor type, no `has_more`. The wire shape below is asserted against the schema's indexes and
// against `catalogue.ts`'s existing `nextCursor`. When the contract gains a pagination entry, this
// file reads it instead of declaring defaults.
import { contractViolation } from '../http/errors.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export type SortDirection = 'asc' | 'desc';

export interface KeysetPosition {
  readonly direction: SortDirection;
  /** The ordering column's value as a string (a timestamp or a numeric string; never a float). */
  readonly value: string;
  /** The tiebreaker id, so two rows with the same `created_at` cannot both be skipped or repeated. */
  readonly id: string;
}

const CURSOR_PREFIX = 'k1:';

export function clampPageSize(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(requested) || requested <= 0) {
    throw contractViolation('out_of_range', 'pageSize', requested, `a whole number of rows between 1 and ${MAX_PAGE_SIZE}`);
  }
  return Math.min(requested, MAX_PAGE_SIZE);
}

export function encodeCursor(position: KeysetPosition): string {
  const payload = JSON.stringify({ d: position.direction, v: position.value, i: position.id });
  return `${CURSOR_PREFIX}${base64UrlEncode(new TextEncoder().encode(payload))}`;
}

export function isKeysetCursor(cursor: string): boolean {
  return cursor.startsWith(CURSOR_PREFIX);
}

/**
 * Decode a cursor this client minted. Anything else — a server's opaque token, a truncated string,
 * a payload with the wrong shape — raises, because a caller that receives `null` here has to
 * distinguish "not mine" from "corrupt", and a single `undefined` return would collapse both into a
 * silent restart.
 */
export function decodeCursor(cursor: string): KeysetPosition {
  if (!isKeysetCursor(cursor)) {
    throw contractViolation('unexpected_shape', 'cursor', 'opaque token', `a ${CURSOR_PREFIX}-prefixed keyset cursor`);
  }
  const decoded = base64UrlDecode(cursor.slice(CURSOR_PREFIX.length));
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(decoded));
  } catch {
    throw contractViolation('malformed_json', 'cursor', 'unparseable payload', 'a keyset cursor payload');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw contractViolation('unexpected_shape', 'cursor', 'non-object payload', 'a { d, v, i } object');
  }
  const record = parsed as Record<string, unknown>;
  const { direction, value, id } = {
    direction: record['d'],
    value: record['v'],
    id: record['i'],
  };
  if (direction !== 'asc' && direction !== 'desc') {
    throw contractViolation('unknown_enum_value', 'cursor.d', direction, 'asc | desc');
  }
  if (typeof value !== 'string' || value === '') {
    throw contractViolation('unexpected_shape', 'cursor.v', value, 'a non-empty ordering value');
  }
  if (typeof id !== 'string' || id === '') {
    throw contractViolation('unexpected_shape', 'cursor.i', id, 'a non-empty tiebreaker id');
  }
  return { direction, value, id };
}

/**
 * The position of the last row on a page, for the next request. The ordering column is named by the
 * caller because it differs per index (`created_at` for orders, `recorded_at` for the ledger) and
 * guessing it from a row is how a cursor outlives a query change.
 */
export function positionFromRow<T extends Record<string, unknown>>(
  row: T,
  orderingKey: keyof T & string,
  idKey: keyof T & string,
  direction: SortDirection,
): KeysetPosition {
  const value = row[orderingKey];
  if (value === undefined || value === null) {
    throw contractViolation('unexpected_shape', `cursor.${orderingKey}`, value, 'a present ordering value');
  }
  const id = row[idKey];
  if (typeof id !== 'string' || id === '') {
    throw contractViolation('unexpected_shape', `cursor.${idKey}`, id, 'a non-empty id');
  }
  return { direction, value: typeof value === 'string' ? value : String(value), id };
}

// --- base64url, hand-rolled ---------------------------------------------------
// Not `btoa`: it is latin-1 only and would corrupt a UTF-8 id, and not `Buffer`: this bundle ships
// to a browser. The alphabet is the URL-safe one (`-`, `_`, no padding) so a cursor can go in a
// query string without escaping and survive a copy out of a log line.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = bytes.subarray(i, Math.min(i + 3, bytes.length));
    const n = (chunk[0] ?? 0) << 16 | (chunk[1] ?? 0) << 8 | (chunk[2] ?? 0);
    const remaining = bytes.length - i;
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
    if (remaining > 1) out += ALPHABET[(n >> 6) & 63];
    if (remaining > 2) out += ALPHABET[n & 63];
  }
  return out;
}

export function base64UrlDecode(text: string): Uint8Array {
  const lookup = new Map<string, number>();
  for (let i = 0; i < ALPHABET.length; i++) lookup.set(ALPHABET[i] as string, i);
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = lookup.get(char);
    if (value === undefined) {
      throw contractViolation('malformed_json', 'cursor', 'invalid base64url character', 'a URL-safe base64 string');
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}
