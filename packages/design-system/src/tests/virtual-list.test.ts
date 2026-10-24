import { describe, it, expect } from 'bun:test';
import { computeWindow, maxScroll, maxWindowRows, sliceWindow, totalListHeight } from '../data/virtual-list.js';

/**
 * The 5 000-row staff queue, tested as pure windowing math — the property that matters is that
 * mounted rows never scale with dataset size, and a synthetic DOM cannot prove that better here.
 */

const ROW_H = 48;
const VIEW = 640;
const TOTAL = 5000;

describe('computeWindow', () => {
  it('at the top, mounts from row 0 and never reaches into negative indices', () => {
    const w = computeWindow({ scrollY: 0, viewportH: VIEW, rowH: ROW_H, total: TOTAL });
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBeGreaterThan(w.startIndex);
    expect(w.offsetY).toBe(0);
    // 14 rows visible + 4 overscan below.
    expect(w.endIndex).toBe(17);
    expect(w.rowCount).toBe(18);
  });

  it('mid-list windows the exact rows under the viewport plus overscan on both sides', () => {
    const w = computeWindow({ scrollY: 4800, viewportH: VIEW, rowH: ROW_H, total: TOTAL });
    // 4800 / 48 = row 100 first visible; overscan pulls the start back to 96.
    expect(w.startIndex).toBe(96);
    expect(w.endIndex).toBe(117);
    expect(w.offsetY).toBe(96 * ROW_H);
  });

  it('the last row is mounted when scrolled to the bottom — the classic off-by-one', () => {
    const bottom = maxScroll(ROW_H, TOTAL, VIEW);
    expect(bottom).toBe(totalListHeight(ROW_H, TOTAL) - VIEW);
    const w = computeWindow({ scrollY: bottom, viewportH: VIEW, rowH: ROW_H, total: TOTAL });
    expect(w.endIndex).toBe(TOTAL - 1);
    expect(w.startIndex).toBeLessThan(TOTAL - 1);
    const items = Array.from({ length: TOTAL }, (_, i) => i);
    const sliced = sliceWindow(items, w);
    expect(sliced[sliced.length - 1]).toBe(TOTAL - 1);
  });

  it('clamps absurd scroll positions instead of rendering blank queue (overscroll & resize)', () => {
    const overscrolled = computeWindow({ scrollY: 10 ** 9, viewportH: VIEW, rowH: ROW_H, total: TOTAL });
    const bottom = computeWindow({ scrollY: maxScroll(ROW_H, TOTAL, VIEW), viewportH: VIEW, rowH: ROW_H, total: TOTAL });
    expect(overscrolled).toEqual(bottom);

    const negative = computeWindow({ scrollY: -320, viewportH: VIEW, rowH: ROW_H, total: TOTAL });
    expect(negative.startIndex).toBe(0);

    // Container resized larger while scrollY stays beyond the new max: window stays legal.
    const resized = computeWindow({ scrollY: 239400, viewportH: 1200, rowH: ROW_H, total: 20 });
    expect(resized.endIndex).toBe(19);
    expect(resized.startIndex).toBe(0);
  });

  it('rapid scroll across the whole list keeps the mount bounded — the point of windowing', () => {
    const jumps = [0, 49000, 12345.75, 239400, 600, 98765, 0, 120000, 239_999_999];
    const bound = maxWindowRows(VIEW, ROW_H);
    for (const scrollY of jumps) {
      const w = computeWindow({ scrollY, viewportH: VIEW, rowH: ROW_H, total: TOTAL });
      expect(w.rowCount).toBeLessThanOrEqual(bound);
      expect(w.startIndex).toBeGreaterThanOrEqual(0);
      expect(w.endIndex).toBeLessThan(TOTAL);
      expect(Number.isFinite(w.offsetY)).toBe(true);
    }
    // Explicitly: at no point do we mount anything close to 5 000 nodes.
    const anyJump = jumps.map((s) => computeWindow({ scrollY: s, viewportH: VIEW, rowH: ROW_H, total: TOTAL }));
    const worst = Math.max(...anyJump.map((w) => w.rowCount));
    expect(worst).toBeLessThan(40);
  });

  it('fractional scroll positions floor to the row grid', () => {
    const w = computeWindow({ scrollY: 241.75, viewportH: VIEW, rowH: ROW_H, total: TOTAL });
    expect(w.startIndex).toBe(Math.max(0, Math.floor(241.75 / ROW_H) - 4));
  });

  it('custom overscan widens the window symmetrically', () => {
    const tight = computeWindow({ scrollY: 4800, viewportH: VIEW, rowH: ROW_H, total: TOTAL, overscan: 0 });
    const loose = computeWindow({ scrollY: 4800, viewportH: VIEW, rowH: ROW_H, total: TOTAL, overscan: 10 });
    expect(tight.startIndex).toBe(100);
    expect(loose.startIndex).toBe(90);
    expect(loose.endIndex).toBe(tight.endIndex + 10);
  });

  it('an empty dataset windows to nothing, and slicing it yields nothing', () => {
    const w = computeWindow({ scrollY: 0, viewportH: VIEW, rowH: ROW_H, total: 0 });
    expect(w.rowCount).toBe(0);
    expect(w.totalHeight).toBe(0);
    expect(sliceWindow([], w)).toEqual([]);
  });
});
