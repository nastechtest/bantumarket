import { describe, expect, test } from 'bun:test';
import { capDevicePixels, createCanvasSizePool, type CanvasSize, type PoolObserver, type SizeEntry } from '../canvas-size-pool.js';

/**
 * jsdom has no ResizeObserver and no rAF ordering guarantees, so the pool is driven entirely by
 * injected fakes: that is the point of the seam — behaviour, not existence.
 */

interface Harness {
  fireResize(...targets: Element[]): void;
  flushFrames(count?: number): void;
  sizes: CanvasSize[];
  pool: ReturnType<typeof createCanvasSizePool>;
  observed: Element[];
  unobserved: Element[];
}

function makeHarness(options: { dprCap?: number; devicePixelRatio?: number; maxDevicePixels?: number; rect?: { width: number; height: number } } = {}): Harness {
  const sizes: CanvasSize[] = [];
  let cb: ((entries: SizeEntry[]) => void) | null = null;
  const jobs: (() => void)[] = [];
  const observed: Element[] = [];
  const unobserved: Element[] = [];
  const fakeObserver: PoolObserver = {
    observe: (el) => observed.push(el),
    unobserve: (el) => unobserved.push(el),
    disconnect: () => undefined,
  };
  const elementStub = { tag: 'div' } as unknown as Element;

  const pool = createCanvasSizePool({
    dprCap: options.dprCap ?? 2,
    devicePixelRatio: () => options.devicePixelRatio ?? 3,
    scheduler: (job) => jobs.push(job),
    observerFactory: (callback) => {
      cb = callback;
      return fakeObserver;
    },
    measure: () => options.rect ?? { width: 300, height: 200 },
  });

  return {
    pool,
    sizes,
    observed,
    unobserved,
    fireResize(...targets: Element[]) {
      cb?.(targets.length > 0 ? targets.map((target) => ({ target })) : [{ target: elementStub }]);
    },
    flushFrames(count = 1) {
      for (let i = 0; i < count; i++) {
        const job = jobs.shift();
        if (job) job();
      }
    },
  };
}

describe('canvas-size-pool', () => {
  test('subscribe triggers one initial measurement, delivered after the frame boundary', () => {
    const h = makeHarness();
    const el = { id: 'canvas' } as unknown as Element;
    h.pool.subscribe(el, (size) => h.sizes.push(size));
    expect(h.sizes).toHaveLength(0); // coalesced: nothing is written mid-frame
    h.flushFrames();
    expect(h.sizes).toHaveLength(1);
    expect(h.sizes[0]).toEqual({ cssWidth: 300, cssHeight: 200, dpr: 2, deviceWidth: 600, deviceHeight: 400 });
  });

  test('many resize events in one frame produce exactly ONE callback with the final size', () => {
    const h = makeHarness();
    const el = { id: 'canvas' } as unknown as Element;
    h.pool.subscribe(el, (size) => h.sizes.push(size));
    h.fireResize(el);
    h.fireResize(el);
    h.fireResize(el);
    expect(h.sizes).toHaveLength(0);
    h.flushFrames();
    expect(h.sizes).toHaveLength(1); // one write per frame, not three reads
  });

  test('the device-pixel cap is applied at measure time, so no subscriber ever sees an over-capped size', () => {
    const h = makeHarness({ devicePixelRatio: 4, dprCap: 1.5 });
    const el = {} as unknown as Element;
    h.pool.subscribe(el, (size) => h.sizes.push(size));
    h.fireResize(el);
    h.flushFrames();
    expect(h.sizes[0]?.dpr).toBe(1.5);
    expect(h.sizes[0]?.deviceWidth).toBe(450);
  });

  test('one observer per element; unobserve only when the LAST subscriber leaves', () => {
    const h = makeHarness();
    const el = {} as unknown as Element;
    const unsubA = h.pool.subscribe(el, () => undefined);
    const unsubB = h.pool.subscribe(el, () => undefined);
    expect(h.observed.length).toBe(1); // observe once, regardless of two subscribers
    unsubA();
    expect(h.unobserved.length).toBe(0); // one subscriber remains — the observer must stay
    unsubB();
    expect(h.unobserved).toContain(el);
  });

  test('maxDevicePixels shrinks area, preserving aspect, below the ceiling', () => {
    const capped = capDevicePixels(300, 200, 2, 2, 100_000);
    expect(capped.deviceWidth * capped.deviceHeight).toBeLessThanOrEqual(100_000);
    expect(capped.deviceWidth / capped.deviceHeight).toBeCloseTo(300 / 200, 1);
  });

  test('dpr cap binds before the pixel ceiling; a 1× device with a huge ceiling is untouched', () => {
    const plain = capDevicePixels(300, 200, 1, 2);
    expect(plain).toEqual({ cssWidth: 300, cssHeight: 200, dpr: 1, deviceWidth: 300, deviceHeight: 200 });
    const capped = capDevicePixels(300, 200, 3, 2);
    expect(capped.dpr).toBe(2);
    expect(capped.deviceWidth).toBe(600);
  });
});
