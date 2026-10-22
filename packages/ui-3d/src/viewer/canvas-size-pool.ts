/**
 * Canvas size pool (07 §4.1 `viewer/`).
 *
 * Every listing card that owns a canvas owns a ResizeObserver, and a grid of six of them resizing
 * during keyboard zoom is six read-write-read-write cycles per frame — layout thrash on the exact
 * devices that cannot afford it. One pool per page: observers are shared per element, measurements
 * are read once per frame, and each subscriber gets exactly one callback per frame with the
 * device-pixel cap already applied.
 */

export interface CanvasSize {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly dpr: number;
  readonly deviceWidth: number;
  readonly deviceHeight: number;
}

/** Subset of ResizeObserverEntry this pool needs — keeps the default injectable in tests. */
export interface SizeEntry {
  readonly target: Element;
}
export interface PoolObserver {
  observe(element: Element): void;
  unobserve(element: Element): void;
  disconnect(): void;
}
export type ObserverFactory = (callback: (entries: readonly SizeEntry[]) => void) => PoolObserver;
export type Scheduler = (job: () => void) => void;

export interface CanvasSizePoolOptions {
  readonly dprCap?: number;
  /** Hard ceiling on deviceWidth × deviceHeight; applied after the DPR cap. */
  readonly maxDevicePixels?: number;
  readonly scheduler?: Scheduler;
  readonly observerFactory?: ObserverFactory;
  readonly devicePixelRatio?: () => number;
  readonly measure?: (element: Element) => { width: number; height: number };
}

export interface CanvasSizePool {
  subscribe(element: Element, callback: (size: CanvasSize) => void): () => void;
  latest(element: Element): CanvasSize | undefined;
  disconnect(): void;
}

const FALLBACK_DPR = 1;

function defaultObserverFactory(callback: (entries: readonly SizeEntry[]) => void): PoolObserver | null {
  const scope = globalThis as { ResizeObserver?: new (cb: (entries: SizeEntry[]) => void) => PoolObserver };
  if (typeof scope.ResizeObserver !== 'function') return null;
  return new scope.ResizeObserver(callback);
}

function frameScheduler(job: () => void): void {
  const scope = globalThis as {
    requestAnimationFrame?: (cb: () => void) => number;
    queueMicrotask?: (job: () => void) => void;
  };
  if (typeof scope.requestAnimationFrame === 'function') scope.requestAnimationFrame(job);
  else if (typeof scope.queueMicrotask === 'function') scope.queueMicrotask(job);
  else job();
}

function defaultMeasure(element: Element): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

/**
 * DPR cap first, then a hard pixel ceiling: a 3× phone at 900×900 css is 7,290,000 device pixels,
 * and no 2 GB GPU cares that the CSS said so. Both knobs are explicit so the number is auditable.
 */
export function capDevicePixels(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  dprCap: number,
  maxDevicePixels?: number,
): CanvasSize {
  const effectiveDpr = Math.min(dpr, dprCap);
  let width = Math.round(Math.max(0, cssWidth) * effectiveDpr);
  let height = Math.round(Math.max(0, cssHeight) * effectiveDpr);
  if (maxDevicePixels !== undefined && width * height > maxDevicePixels && width > 0 && height > 0) {
    const shrink = Math.sqrt(maxDevicePixels / (width * height));
    width = Math.max(1, Math.floor(width * shrink));
    height = Math.max(1, Math.floor(height * shrink));
  }
  return { cssWidth, cssHeight, dpr: effectiveDpr, deviceWidth: width, deviceHeight: height };
}

export function createCanvasSizePool(options: CanvasSizePoolOptions = {}): CanvasSizePool {
  const dprCap = options.dprCap ?? Number.POSITIVE_INFINITY;
  const scheduler = options.scheduler ?? frameScheduler;
  const measure = options.measure ?? defaultMeasure;
  const devicePixelRatio = options.devicePixelRatio ?? (() => {
    const scope = globalThis as { window?: { devicePixelRatio?: number } };
    return scope.window?.devicePixelRatio ?? FALLBACK_DPR;
  });

  const subscribers = new Map<Element, Set<(size: CanvasSize) => void>>();
  const pending = new Map<Element, CanvasSize>();
  const latest = new Map<Element, CanvasSize>();
  let scheduled = false;
  let observer: PoolObserver | null = null;
  const observing = new Set<Element>();

  function ensureObserver(): PoolObserver | null {
    if (observer) return observer;
    const factory = options.observerFactory ?? defaultObserverFactory;
    observer = factory((entries) => {
      for (const entry of entries) markDirty(entry.target);
    });
    return observer;
  }

  function markDirty(element: Element): void {
    // Coalesce: any number of resize events in one frame produce one flush.
    if (!scheduled) {
      scheduled = true;
      scheduler(flush);
    }
    // Touch the pending map so flush knows what to measure even if the entry repeats.
    if (!pending.has(element)) pending.set(element, latest.get(element) ?? capDevicePixels(0, 0, 1, dprCap));
  }

  function flush(): void {
    scheduled = false;
    const elements = [...pending.keys()];
    pending.clear();
    for (const element of elements) {
      const rect = measure(element);
      const size = capDevicePixels(rect.width, rect.height, devicePixelRatio(), dprCap, options.maxDevicePixels);
      latest.set(element, size);
      const callbacks = subscribers.get(element);
      if (!callbacks) continue;
      for (const callback of callbacks) callback(size);
    }
  }

  return {
    subscribe(element, callback) {
      let set = subscribers.get(element);
      if (!set) {
        set = new Set();
        subscribers.set(element, set);
      }
      set.add(callback);
      const obs = ensureObserver();
      if (obs && !observing.has(element)) {
        observing.add(element);
        obs.observe(element);
      }
      markDirty(element);
      return () => {
        set.delete(callback);
        if (set.size === 0) {
          subscribers.delete(element);
          obs?.unobserve(element);
          observing.delete(element);
          latest.delete(element);
        }
      };
    },
    latest(element) {
      return latest.get(element);
    },
    disconnect() {
      observer?.disconnect();
      observing.clear();
      pending.clear();
    },
  };
}
