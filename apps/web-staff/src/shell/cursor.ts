/**
 * Paging for a console table. A cursor is opaque to the UI and keyset on the wire: the UI passes
 * `nextCursor` back untouched. `offset` is deliberately absent from every query type in this app,
 * because at 100 000 rows an offset is both slow and capable of skipping a row under concurrent
 * writes.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 50;

export interface CursorPage<T> {
  readonly rows: readonly T[];
  readonly nextCursor: string | null;
  /** Rows the server examined, for the "bounded" assertion; never a row count of the table. */
  readonly scanned: number;
}

export class CursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CursorError';
  }
}

export function clampPageSize(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new CursorError('page size must be a positive whole number');
  }
  return Math.min(requested, MAX_PAGE_SIZE);
}

export interface Keyset {
  /** Ordering value, descending — an ISO instant or a sort key encoded as text. */
  readonly at: string;
  readonly id: string;
}

const PREFIX = 'k1.';

export function encodeKeysetCursor(keyset: Keyset): string {
  if (!keyset.at || !keyset.id) throw new CursorError('a cursor needs both an ordering value and an id');
  return `${PREFIX}${encodeURIComponent(keyset.at)}.${encodeURIComponent(keyset.id)}`;
}

export function decodeKeysetCursor(cursor: string): Keyset {
  if (!cursor.startsWith(PREFIX)) throw new CursorError('cursor is not a staff-console cursor');
  const rest = cursor.slice(PREFIX.length);
  const separator = rest.lastIndexOf('.');
  if (separator <= 0) throw new CursorError('cursor is truncated');
  const at = decodeURIComponent(rest.slice(0, separator));
  const id = decodeURIComponent(rest.slice(separator + 1));
  if (!at || !id) throw new CursorError('cursor is incomplete');
  return { at, id };
}

/** True when `row` sorts strictly after `keyset` in descending (at, id) order. */
export function rowIsAfter(row: Keyset, keyset: Keyset): boolean {
  if (row.at < keyset.at) return true;
  if (row.at > keyset.at) return false;
  return row.id < keyset.id;
}

export function isCursorPage<T>(value: unknown): value is CursorPage<T> {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record['rows']) &&
    (record['nextCursor'] === null || typeof record['nextCursor'] === 'string') &&
    typeof record['scanned'] === 'number'
  );
}

export interface BoundedRange {
  readonly from: string;
  readonly to: string;
}

export const MAX_RANGE_DAYS = 31;

export function rangeDays(range: BoundedRange): number {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  if (Number.isNaN(from) || Number.isNaN(to)) throw new CursorError('range bounds must be instants');
  if (to < from) throw new CursorError('range ends before it starts');
  return Math.ceil((to - from) / 86_400_000);
}

/**
 * A full-table date range is how an audit screen takes the database down. The UI will not send
 * one, and the transport asserts this again.
 */
export function assertBoundedRange(range: BoundedRange): void {
  if (rangeDays(range) > MAX_RANGE_DAYS) {
    throw new CursorError(`range is limited to ${MAX_RANGE_DAYS} days`);
  }
}
