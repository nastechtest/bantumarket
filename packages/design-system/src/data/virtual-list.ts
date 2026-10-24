/**
 * Windowed-list math, headless and pure — the staff dispute queue is 5 000 rows and a 5 000-node
 * mount on a mid-grade Android is the whole argument against naive lists. There is no DOM here
 * to get wrong: the render side just splices `items.slice(startIndex, endIndex + 1)` between two
 * spacer divs of `offsetY` and `totalHeight - offsetY - (end+1-start)*rowH`.
 *
 * The invariant the tests hold: the window size is bounded by the viewport and the overscan,
 * never by the dataset — scrolling fast or resizing can therefore never grow the mount.
 */

export interface WindowSpec {
  readonly scrollY: number;
  readonly viewportH: number;
  readonly rowH: number;
  readonly total: number;
  /** Extra rows kept mounted above and below the viewport, default 4. */
  readonly overscan?: number;
}

export interface VirtualWindow {
  readonly startIndex: number;
  /** Inclusive. Equal to `startIndex` when `total` is 0 so callers can render nothing cleanly. */
  readonly endIndex: number;
  readonly offsetY: number;
  readonly totalHeight: number;
  readonly rowCount: number;
}

const DEFAULT_OVERSCAN = 4;

export function totalListHeight(rowH: number, total: number): number {
  return rowH * Math.max(0, total);
}

/** The maximum legal `scrollY` for a viewport; callers clamp their own scroll events with this. */
export function maxScroll(rowH: number, total: number, viewportH: number): number {
  return Math.max(0, totalListHeight(rowH, total) - viewportH);
}

export function computeWindow(spec: WindowSpec): VirtualWindow {
  const overscan = spec.overscan ?? DEFAULT_OVERSCAN;
  const total = Math.max(0, spec.total);
  const totalHeight = totalListHeight(spec.rowH, total);
  if (total === 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0, rowCount: 0 };
  }
  // A resize can leave the browser's reported scrollY beyond the new max; clamping here keeps
  // the window honest instead of rendering blank space at the head of the queue.
  const scroll = Math.min(Math.max(0, spec.scrollY), maxScroll(spec.rowH, total, spec.viewportH));
  const firstVisible = Math.floor(scroll / spec.rowH);
  const visibleCount = Math.max(1, Math.ceil(spec.viewportH / spec.rowH));
  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(total - 1, firstVisible + visibleCount - 1 + overscan);
  return {
    startIndex,
    endIndex,
    offsetY: startIndex * spec.rowH,
    totalHeight,
    rowCount: endIndex - startIndex + 1,
  };
}

export function sliceWindow<T>(items: readonly T[], window: VirtualWindow): T[] {
  if (window.rowCount === 0) return [];
  return items.slice(window.startIndex, window.endIndex + 1);
}

/**
 * Row count a correct window may never exceed — used by the mount-bound test. It is the viewport
 * in rows plus two overscans, plus one for the ceil; anything larger is a bug that scales with
 * the dataset, which is exactly what virtualising is here to prevent.
 */
export function maxWindowRows(viewportH: number, rowH: number, overscan?: number): number {
  return Math.ceil(viewportH / rowH) + 2 * (overscan ?? DEFAULT_OVERSCAN) + 1;
}
