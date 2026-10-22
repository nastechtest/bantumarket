import { describe, expect, test } from 'bun:test';
import { FrameGovernor, LEVEL_LADDER, PIXEL_RATIO_SCALE, type GovernorLevel } from '../frame-governor.js';

/** Fake clock: the governor must be provable without rAF or a GL context. */
function fakeClock(stepMs: number) {
  let t = 0;
  return {
    now: () => t,
    advance: (ms = stepMs) => {
      t += ms;
    },
  };
}

function runTicks(governor: FrameGovernor, clock: ReturnType<typeof fakeClock>, count: number): void {
  for (let i = 0; i < count; i++) {
    clock.advance();
    governor.tick();
  }
}

describe('frame-governor', () => {
  test('healthy frames never step the level down', () => {
    const clock = fakeClock(16); // 62 fps vs a 33 ms budget — comfortably inside
    const changes: GovernorLevel[] = [];
    const governor = new FrameGovernor({
      now: clock.now,
      frameBudgetMs: 33,
      windowSize: 4,
      sustainedWindows: 2,
      onLevelChange: (l) => changes.push(l),
    });
    runTicks(governor, clock, 40);
    expect(governor.level()).toBe('full');
    expect(changes).toEqual([]);
  });

  test('sustained overrun walks the whole ladder: dpr → pixel → lod → stopped', () => {
    const clock = fakeClock(60); // ~16 fps against a 33 ms budget
    const changes: GovernorLevel[] = [];
    const governor = new FrameGovernor({
      now: clock.now,
      frameBudgetMs: 33,
      windowSize: 4,
      sustainedWindows: 2,
      onLevelChange: (l) => changes.push(l),
    });
    runTicks(governor, clock, 200);

    expect(changes).toEqual(['dpr', 'pixel', 'lod', 'stopped']);
    expect(governor.level()).toBe('stopped');
    expect(LEVEL_LADDER.indexOf('stopped')).toBe(LEVEL_LADDER.length - 1);
  });

  test('a single overrun window does not step down — sustained means sustained', () => {
    const clock = fakeClock(16);
    const changes: GovernorLevel[] = [];
    const governor = new FrameGovernor({
      now: clock.now,
      frameBudgetMs: 33,
      windowSize: 4,
      sustainedWindows: 2,
      onLevelChange: (l) => changes.push(l),
    });
    // One bad window, then healthy ones: the streak resets and nothing fires.
    for (let i = 0; i < 4; i++) {
      clock.advance(90);
      governor.tick();
    }
    runTicks(governor, clock, 32);
    expect(changes).toEqual([]);
    expect(governor.level()).toBe('full');
  });

  test('tab stalls are ignored, not mistaken for GPU failure', () => {
    const clock = fakeClock(16);
    // sustainedWindows 1: ONE overrun window would step down — so this test fails if the stall
    // interval were counted.
    const governor = new FrameGovernor({ now: clock.now, frameBudgetMs: 33, windowSize: 4, sustainedWindows: 1 });
    clock.advance();
    governor.tick();
    clock.advance();
    governor.tick();
    clock.advance(30_000); // backgrounded for half a minute
    governor.tick();
    runTicks(governor, clock, 2); // completes the window with healthy samples only
    expect(governor.level()).toBe('full');
  });

  test('once stopped, ticks are inert and the settled level is reported in stats', () => {
    const clock = fakeClock(60);
    const governor = new FrameGovernor({ now: clock.now, frameBudgetMs: 33, windowSize: 4, sustainedWindows: 2 });
    runTicks(governor, clock, 500);
    expect(governor.level()).toBe('stopped');
    const stats = governor.stats();
    expect(stats.avgFrameMs).toBeCloseTo(60, 0);
    expect(stats.windowsCompleted).toBeGreaterThan(0);
    const before = governor.stats();
    runTicks(governor, clock, 20);
    expect(governor.stats().windowsCompleted).toBe(before.windowsCompleted);
  });

  test('the ladder ends in a real stop: stopped zeroes the pixel ratio and full keeps it', () => {
    expect(PIXEL_RATIO_SCALE.full).toBe(1);
    expect(PIXEL_RATIO_SCALE.stopped).toBe(0);
    // Monotone non-increasing down the ladder: a step down must never raise GPU load.
    for (let i = 1; i < LEVEL_LADDER.length; i++) {
      expect(PIXEL_RATIO_SCALE[LEVEL_LADDER[i] as GovernorLevel]).toBeLessThanOrEqual(
        PIXEL_RATIO_SCALE[LEVEL_LADDER[i - 1] as GovernorLevel],
      );
    }
  });
});
