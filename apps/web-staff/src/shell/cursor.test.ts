import { describe, expect, it } from 'bun:test';
import {
  CursorError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  assertBoundedRange,
  clampPageSize,
  decodeKeysetCursor,
  encodeKeysetCursor,
  isCursorPage,
  rangeDays,
  rowIsAfter,
} from './cursor.js';

describe('page size', () => {
  it('defaults to a bounded page and clamps larger requests', () => {
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(1)).toBe(1);
    expect(clampPageSize(1000)).toBe(MAX_PAGE_SIZE);
  });

  it('refuses a zero, negative or fractional page size', () => {
    expect(() => clampPageSize(0)).toThrow(CursorError);
    expect(() => clampPageSize(-5)).toThrow(CursorError);
    expect(() => clampPageSize(2.5)).toThrow(CursorError);
  });
});

describe('keyset cursors', () => {
  it('round-trips an ordering value and id, including characters that need escaping', () => {
    const cursor = encodeKeysetCursor({ at: '2026-10-22T09:00:00.000Z', id: 'evt a/b+c' });
    expect(cursor.startsWith('k1.')).toBe(true);
    expect(decodeKeysetCursor(cursor)).toEqual({ at: '2026-10-22T09:00:00.000Z', id: 'evt a/b+c' });
  });

  it('is opaque: no offset or page number appears in the token', () => {
    const cursor = encodeKeysetCursor({ at: '2026-10-22T09:00:00.000Z', id: 'evt_1' });
    expect(cursor).not.toContain('offset');
    expect(cursor).not.toContain('page');
  });

  it('refuses another system’s cursor and a truncated one', () => {
    expect(() => decodeKeysetCursor('abc.def')).toThrow(CursorError);
    expect(() => decodeKeysetCursor('k1.no-separator')).toThrow(CursorError);
  });

  it('orders rows strictly after the cursor in descending (at, id)', () => {
    const keyset = { at: '2026-10-22T09:00:00.000Z', id: 'evt_5' };
    expect(rowIsAfter({ at: '2026-10-22T08:59:00.000Z', id: 'evt_9' }, keyset)).toBe(true);
    expect(rowIsAfter({ at: '2026-10-22T09:00:00.000Z', id: 'evt_4' }, keyset)).toBe(true);
    expect(rowIsAfter({ at: '2026-10-22T09:00:00.000Z', id: 'evt_5' }, keyset)).toBe(false);
    expect(rowIsAfter({ at: '2026-10-22T09:01:00.000Z', id: 'evt_1' }, keyset)).toBe(false);
  });
});

describe('bounded ranges', () => {
  const range = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-22T00:00:00.000Z' };

  it('counts whole days spanning the range', () => {
    expect(rangeDays(range)).toBe(21);
  });

  it('refuses a range longer than a month', () => {
    expect(() => assertBoundedRange({ from: '2026-01-01T00:00:00.000Z', to: '2026-10-22T00:00:00.000Z' })).toThrow(
      'range is limited to 31 days',
    );
    expect(() => assertBoundedRange(range)).not.toThrow();
  });

  it('refuses an inverted or unparseable range', () => {
    expect(() => rangeDays({ from: '2026-10-22T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' })).toThrow(CursorError);
    expect(() => rangeDays({ from: 'yesterday', to: 'today' })).toThrow(CursorError);
  });
});

describe('page shape', () => {
  it('accepts a page with rows, a nullable cursor and a scanned count', () => {
    expect(isCursorPage({ rows: [], nextCursor: null, scanned: 0 })).toBe(true);
    expect(isCursorPage({ rows: [], nextCursor: 'k1.x', scanned: 1 })).toBe(true);
  });

  it('refuses an offset-style page payload', () => {
    expect(isCursorPage({ rows: [], offset: 25 })).toBe(false);
    expect(isCursorPage(null)).toBe(false);
  });
});
