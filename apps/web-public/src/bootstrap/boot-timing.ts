/**
 * Boot timing — enough instrumentation to defend the 170 KB first-paint budget with numbers,
 * not vibes, and nothing more (a real APM is `sentry-slot.ts`'s problem).
 *
 * The timer is built on an injected clock because the thing worth testing is the arithmetic
 * (mark deltas, missing marks), and `performance.now()` in a test process proves nothing about
 * a browser. In the browser it also mirrors marks into `performance.mark` so a profiling trace
 * shows the same labels the app reports.
 */

export type BootMark =
  | 'js:parse-start'
  | 'react:first-render'
  | 'react:committed'
  | 'chrome:interactive'
  | 'route:ready';

export const BOOT_MARK_ORDER: readonly BootMark[] = [
  'js:parse-start',
  'react:first-render',
  'react:committed',
  'chrome:interactive',
  'route:ready',
];

export interface BootTimer {
  mark(name: BootMark): void;
  /** Null when either mark is missing — a partial boot must not report a fake duration. */
  elapsed(from: BootMark, to: BootMark): number | null;
  snapshot(): Readonly<Partial<Record<BootMark, number>>>;
}

interface PerformanceLike {
  now(): number;
  mark?(name: string): void;
}

function browserPerformance(): PerformanceLike | null {
  if (typeof performance === 'undefined' || typeof performance.now !== 'function') return null;
  return performance as PerformanceLike;
}

export function createBootTimer(now: () => number, mirror: (name: string) => void = () => {}): BootTimer {
  const marks = new Map<BootMark, number>();
  return {
    mark(name) {
      if (!marks.has(name)) {
        marks.set(name, now());
        mirror(name);
      }
      // Later marks of the same name are ignored: "first render" means first.
    },
    elapsed(from, to) {
      const a = marks.get(from);
      const b = marks.get(to);
      if (a === undefined || b === undefined) return null;
      return b - a;
    },
    snapshot: () => Object.fromEntries(marks) as Readonly<Partial<Record<BootMark, number>>>,
  };
}

function safeMirror(name: string): void {
  const perf = browserPerformance();
  try {
    perf?.mark?.(`nt:${name}`);
  } catch {
    // Safari throws on mark names it dislikes; timing telemetry must never take the app down.
  }
}

export const appBootTimer: BootTimer = createBootTimer(
  () => browserPerformance()?.now() ?? 0,
  safeMirror,
);

export function markBoot(name: BootMark): void {
  appBootTimer.mark(name);
}

/**
 * LCP, observed if the browser supports it (it is the metric the 170 KB budget is *for*).
 * Returns a teardown even where unsupported, so callers never branch on capability.
 */
export function observeLargestContentfulPaint(onValueMs: (value: number) => void): () => void {
  if (typeof window === 'undefined' || typeof window.PerformanceObserver === 'undefined') {
    return () => {};
  }
  let observer: PerformanceObserver | null = null;
  try {
    observer = new window.PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) onValueMs(last.startTime);
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // older engines throw on unsupported observe types: no LCP, no crash
  }
  return () => {
    try {
      observer?.disconnect();
    } catch {
      // already gone
    }
  };
}
