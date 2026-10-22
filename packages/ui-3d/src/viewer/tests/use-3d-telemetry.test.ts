import { describe, expect, test } from 'bun:test';
import { createTelemetryCollector } from '../use-3d-telemetry.js';

function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('3d telemetry (the numbers gate D1 reads)', () => {
  test('unmeasured fields read null, not an optimistic default', () => {
    const clock = fakeClock();
    const collector = createTelemetryCollector({ now: clock.now });
    expect(collector.snapshot()).toEqual({
      firstPaintMs: null,
      sceneReadyMs: null,
      governorLevel: null,
      lodTier: null,
      bytesFetched: 0,
      contextLost: false,
    });
  });

  test('marks are measured against the collector origin and the first mark wins', () => {
    const clock = fakeClock();
    const collector = createTelemetryCollector({ now: clock.now });
    clock.advance(120);
    collector.mark('first-paint');
    clock.advance(30);
    collector.mark('first-paint'); // late duplicate must NOT overwrite the real paint time
    clock.advance(450);
    collector.mark('scene-ready');
    const snap = collector.snapshot();
    expect(snap.firstPaintMs).toBe(120);
    expect(snap.sceneReadyMs).toBe(600);
  });

  test('bytes accumulate from streamed chunks and a negative delta is refused', () => {
    const collector = createTelemetryCollector({ now: () => 0 });
    collector.addBytesFetched(1024);
    collector.addBytesFetched(2048);
    expect(collector.snapshot().bytesFetched).toBe(3072);
    expect(() => collector.addBytesFetched(-1)).toThrow(TypeError);
  });

  test('governor level, LOD and context loss are all visible in one snapshot', () => {
    const collector = createTelemetryCollector({ now: () => 0 });
    collector.setGovernorLevel('pixel');
    collector.setLodTier('lod1');
    collector.markContextLost();
    const snap = collector.snapshot();
    expect(snap.governorLevel).toBe('pixel');
    expect(snap.lodTier).toBe('lod1');
    expect(snap.contextLost).toBe(true);
  });
});
