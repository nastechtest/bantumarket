import { describe, it, expect } from 'bun:test';
import { appBootTimer, BOOT_MARK_ORDER, createBootTimer, observeLargestContentfulPaint, type BootMark } from './boot-timing.js';

/**
 * The arithmetic of boot: deltas, missing marks, "first means first". `performance.now()` in a
 * test process proves nothing about a browser, so the timer is built on an injected clock — the
 * same clock the browser path passes — and this suite exercises it deterministically.
 */

function fakeClock(start = 0) {
  let t = start;
  const mirrored: string[] = [];
  return {
    now: () => {
      t += 25; // every read advances the clock: no accidental equal-mark collisions
      return t;
    },
    mirrored,
    mirror: (name: string) => mirrored.push(name),
  };
}

describe('boot timer', () => {
  it('measures the delta between two marks', () => {
    const c = fakeClock(100);
    const timer = createBootTimer(c.now, c.mirror);
    timer.mark('js:parse-start');
    timer.mark('react:committed');
    const delta = timer.elapsed('js:parse-start', 'react:committed');
    expect(delta).not.toBeNull();
    expect(delta!).toBeGreaterThan(0);
    expect(delta! % 25).toBe(0); // fake clock ticks in 25s; the delta is exactly one tick
  });

  it('keeps the FIRST value when a mark repeats — "first render" means first', () => {
    const c = fakeClock(0);
    const timer = createBootTimer(c.now, c.mirror);
    timer.mark('react:first-render');
    const first = timer.snapshot()['react:first-render'];
    timer.mark('react:first-render');
    expect(timer.snapshot()['react:first-render']).toBe(first);
    expect(c.mirrored).toEqual(['react:first-render']);
  });

  it('a partial boot reports null, never a fabricated duration', () => {
    const timer = createBootTimer(fakeClock(0).now);
    timer.mark('js:parse-start');
    expect(timer.elapsed('js:parse-start', 'route:ready')).toBeNull();
    expect(timer.elapsed('route:ready', 'js:parse-start')).toBeNull();
  });

  it('snapshot exposes recorded marks only, in the declared vocabulary', () => {
    const timer = createBootTimer(fakeClock(0).now);
    timer.mark('chrome:interactive');
    const snap = timer.snapshot();
    expect(Object.keys(snap)).toEqual(['chrome:interactive']);
    for (const k of Object.keys(snap) as BootMark[]) {
      expect(BOOT_MARK_ORDER).toContain(k);
    }
  });
});

describe('browser wiring stays guarded', () => {
  it('the app timer accepts marks without a mirror blowing up', () => {
    expect(() => appBootTimer.mark('js:parse-start')).not.toThrow();
    // LCP observer: returns a teardown even where the engine lacks it; teardown is safe.
    const stop = observeLargestContentfulPaint(() => {});
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
  });
});
