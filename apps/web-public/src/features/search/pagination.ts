/**
 * Cursor pagination. The cursor lives in the URL, so a shared link reproduces the *page* too,
 * not just the filters. This repo's fake server (api/fixtures.ts) encodes cursors as page
 * markers; the transport contract treats them as opaque, and nothing here assumes a server can
 * decode them beyond `decodePageCursor`.
 */

export const PAGE_SIZE = 8;

export type Cursor = string | null;

/** Page 1 has no cursor — `null` is the canonical "first page", not 'p1'. */
export function encodePageCursor(page: number): Cursor {
  return page <= 1 ? null : `p${page}`;
}

export function cursorForPage(page: number): Cursor {
  return encodePageCursor(page);
}

export function decodePageCursor(cursor: Cursor): number {
  if (cursor === null) return 1;
  const match = /^p(\d{1,6})$/.exec(cursor);
  if (match === null) return 1;
  const page = Number(match[1]);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/**
 * The back-stack is *session* state, not URL state: only the current cursor is shareable.
 * Pushing on "next" and popping on "back" keeps the trail immutable so React re-renders honestly.
 */
export type CursorTrail = readonly Cursor[];

export function trailPush(trail: CursorTrail, cursor: Cursor): CursorTrail {
  return [...trail, cursor];
}

export function trailPop(trail: CursorTrail): { cursor: Cursor; rest: CursorTrail } {
  if (trail.length === 0) return { cursor: null, rest: trail };
  return { cursor: trail[trail.length - 1] ?? null, rest: trail.slice(0, -1) };
}

export function pageLabel(cursor: Cursor): string {
  return String(decodePageCursor(cursor));
}
