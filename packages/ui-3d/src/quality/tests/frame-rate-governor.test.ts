import { describe, expect, it } from 'bun:test';
import {
  createFrameRateGovernor,
  frameBudgetMicrosecondsFor,
  frameBudgetMicrosecondsPerSecond,
  nextLevelDown,
  nextLevelUp,
  QUALITY_LEVELS,
  TARGET_FRAMERATE,
  type Clock,
  type FrameRateGovernor,
  type GovernorDecision,
  type GovernorOptions,
  type QualityLevel,
} from '../frame-rate-governor.js';

/** 25 ms/frame: over the 60 fps bar (16.67 ms), inside the 30 fps bar (33.33 ms). This is the load a
 *  mid-range phone settles at, which is why it is the case the whole design turns on. */
const SLOW_MS = 25;
/** 10 ms/frame: inside every bar, i.e. a device that can genuinely hold 60 fps. */
const FAST_MS = 10;
/** 18 ms/frame: comfortable at `balanced`, and not proof of anything at `high`. */
const MIDDLE_MS = 18;
/** 40 ms/frame: over the bar at every level that renders, so the floor is reachable. */
const HEAVY_MS = 40;

function make(options: Partial<GovernorOptions> & { clock: Clock }): FrameRateGovernor {
  return createFrameRateGovernor(options);
}

/**
 * Feed frames at a fixed interval until `windowCount` windows have closed. The timeline stays
 * continuous across calls (the returned `t` is the next `t0`), so a device can be slow, then
 * comfortable, then fast, and the windows line up with nothing but the governor's own clock.
 */
function runWindows(
  governor: FrameRateGovernor,
  intervalMs: number,
  windowCount: number,
  t0: number,
): { decisions: GovernorDecision[]; t: number } {
  const decisions: GovernorDecision[] = [];
  let t = t0;
  let guard = 0;
  while (decisions.length < windowCount && guard++ < 100_000) {
    t += intervalMs;
    const d = governor.observe(t);
    if (d) decisions.push(d);
  }
  return { decisions, t };
}

function timeline(intervalMs: number, count: number, startMs = 0): number[] {
  return Array.from({ length: count }, (_, i) => startMs + i * intervalMs);
}

function drive(governor: FrameRateGovernor, times: number[]): GovernorDecision[] {
  const decisions: GovernorDecision[] = [];
  for (const t of times) {
    const d = governor.observe(t);
    if (d) decisions.push(d);
  }
  return decisions;
}

describe('frame-rate governor: falling', () => {
  it('holds on one bad window and steps down on the second', () => {
    const g = make({ clock: () => 0 });
    const { decisions } = runWindows(g, SLOW_MS, 2, 0);

    expect(decisions).toHaveLength(2);
    expect(decisions[0]!.level).toBe('high');
    expect(decisions[0]!.reason).toBe('holding');
    expect(decisions[0]!.changed).toBe(false);
    expect(decisions[0]!.badStreak).toBe(1);

    expect(decisions[1]!.level).toBe('balanced');
    expect(decisions[1]!.reason).toBe('stepped-down');
    expect(decisions[1]!.changed).toBe(true);
    expect(g.level()).toBe('balanced');
  });

  it('reports the window that earned the move, not the empty one after it', () => {
    const g = make({ clock: () => 0 });
    const { decisions } = runWindows(g, SLOW_MS, 2, 0);
    const evidence = decisions[1]!.window!;
    expect(evidence.overBudget).toBe(true);
    expect(evidence.frames).toBeGreaterThanOrEqual(12);
    expect(evidence.budgetMicroseconds).toBe(frameBudgetMicrosecondsFor('high'));
  });

  it('needs two more bad windows to fall again — one dip cannot spend the evidence twice', () => {
    // 40 ms is over the bar at `high` and still over it at `balanced` (33.33 ms), so the scene can
    // actually reach the floor; 25 ms could not, which is the point of the per-level budget.
    const g = make({ clock: () => 0 });
    const first = runWindows(g, HEAVY_MS, 2, 0);
    expect(g.level()).toBe('balanced');

    const third = runWindows(g, HEAVY_MS, 1, first.t);
    expect(third.decisions[0]!.level).toBe('balanced');
    expect(third.decisions[0]!.badStreak).toBe(1);

    const fourth = runWindows(g, HEAVY_MS, 1, third.t);
    expect(fourth.decisions[0]!.level).toBe('static');
    expect(fourth.decisions[0]!.reason).toBe('stepped-down');
  });

  it('the static path is the floor and is never left on its own', () => {
    const g = make({ clock: () => 0, initialLevel: 'static' });
    const { decisions } = runWindows(g, SLOW_MS, 8, 0);
    expect(g.level()).toBe('static');
    expect(decisions.every((d) => d.reason === 'at-floor' && d.changed === false)).toBe(true);
  });

  it('fast frames at the floor do not buy back WebGL that nobody asked for', () => {
    // The page's own rAF loop is 10 ms even when the scene is off. Promoting on that evidence would
    // re-fetch a 2 MB asset and recompile shaders on the device that just failed to hold them.
    const g = make({ clock: () => 0, initialLevel: 'static' });
    const { decisions } = runWindows(g, FAST_MS, 12, 0);
    expect(g.level()).toBe('static');
    expect(decisions.some((d) => d.changed)).toBe(false);
  });
});

describe('frame-rate governor: climbing is harder than falling', () => {
  it('stays down under a constant slow load instead of flapping', () => {
    const g = make({ clock: () => 0 });
    const drop = runWindows(g, SLOW_MS, 2, 0);
    expect(g.level()).toBe('balanced');

    const later = runWindows(g, SLOW_MS, 8, drop.t);
    expect(g.level()).toBe('balanced');
    expect(later.decisions.every((d) => d.changed === false)).toBe(true);
    // 25 ms is not a failure at 30 fps, and it is not evidence for 60 either.
    expect(later.decisions.every((d) => d.window!.overBudget === false && d.window!.climbGrade === false)).toBe(true);
  });

  it('needs exactly four consecutive good windows to climb, and no fewer', () => {
    const g = make({ clock: () => 0 });
    const drop = runWindows(g, SLOW_MS, 2, 0);
    const climb = runWindows(g, FAST_MS, 4, drop.t);

    expect(climb.decisions[0]!.goodStreak).toBe(1);
    expect(climb.decisions[0]!.level).toBe('balanced');
    expect(climb.decisions[2]!.reason).toBe('holding');
    expect(climb.decisions[2]!.level).toBe('balanced');
    expect(climb.decisions[3]!.level).toBe('high');
    expect(climb.decisions[3]!.reason).toBe('stepped-up');
    expect(g.level()).toBe('high');
  });

  it('a merely comfortable window breaks the climb run', () => {
    const g = make({ clock: () => 0 });
    const drop = runWindows(g, SLOW_MS, 2, 0);
    const three = runWindows(g, FAST_MS, 3, drop.t);
    expect(three.decisions[2]!.goodStreak).toBe(3);

    const comfortable = runWindows(g, MIDDLE_MS, 1, three.t);
    expect(comfortable.decisions[0]!.reason).toBe('holding');
    expect(comfortable.decisions[0]!.goodStreak).toBe(0);
    expect(comfortable.decisions[0]!.changed).toBe(false);

    const after = runWindows(g, FAST_MS, 3, comfortable.t);
    expect(after.decisions.map((d) => d.goodStreak)).toEqual([1, 2, 3]);
    expect(g.level()).toBe('balanced');

    const fourth = runWindows(g, FAST_MS, 1, after.t);
    expect(fourth.decisions[0]!.reason).toBe('stepped-up');
    expect(g.level()).toBe('high');
  });

  it('a sawtooth input moves the level nowhere', () => {
    const g = make({ clock: () => 0 });
    let t = 0;
    const all: GovernorDecision[] = [];
    for (let i = 0; i < 12; i++) {
      const run = runWindows(g, i % 2 === 0 ? SLOW_MS : FAST_MS, 1, t);
      t = run.t;
      all.push(...run.decisions);
    }
    expect(all.length).toBe(12);
    expect(all.every((d) => d.changed === false)).toBe(true);
    expect(all.every((d) => d.level === 'high')).toBe(true);
    expect(g.level()).toBe('high');
    expect(all.every((d) => d.badStreak <= 1)).toBe(true);
  });

  it('one good window breaks a bad run too', () => {
    const g = make({ clock: () => 0 });
    const bad = runWindows(g, SLOW_MS, 1, 0);
    expect(bad.decisions[0]!.badStreak).toBe(1);
    const good = runWindows(g, FAST_MS, 1, bad.t);
    expect(good.decisions[0]!.badStreak).toBe(0);
    expect(g.level()).toBe('high');
  });
});

describe('frame-rate governor: a window is a measurement', () => {
  it('a window with too few frames measures nothing and moves nothing', () => {
    const g = make({ clock: () => 0 });
    const decisions = drive(g, [0, 10, 250, 500, 1000]);
    expect(decisions.length).toBe(2);
    expect(decisions.every((d) => d.reason === 'measuring' && d.changed === false)).toBe(true);
    expect(g.level()).toBe('high');
  });

  it('a backgrounded tab is discarded, not counted as a slow frame', () => {
    const g = make({ clock: () => 0 });
    const before = runWindows(g, SLOW_MS, 1, 0);
    expect(before.decisions[0]!.reason).toBe('holding');

    const stalled = g.observe(before.t + 5000);
    expect(stalled!.reason).toBe('stalled');
    expect(stalled!.changed).toBe(false);
    expect(stalled!.window!.stalled).toBe(true);
    expect(stalled!.window!.frames).toBe(0);
    expect(g.level()).toBe('high');
  });

  it('a clock that goes backwards is discarded rather than producing a negative frame', () => {
    const g = make({ clock: () => 0 });
    const first = runWindows(g, SLOW_MS, 1, 0);
    const back = g.observe(first.t - 100);
    expect(back!.reason).toBe('stalled');
    expect(g.level()).toBe('high');
    expect(back!.window!.frames).toBe(0);
  });

  it('two frames inside the same tick are ignored, not counted as a stall', () => {
    // The wiring may hand over a millisecond-resolution clock; at 60 fps that means the same value
    // twice in a while. The answer is to measure nothing, not to drop the buyer to the static path.
    const g = make({ clock: () => 0 });
    expect(g.observe(0)).toBeNull();
    expect(g.observe(16)).toBeNull();
    expect(g.observe(16)).toBeNull();
    expect(g.observe(32)).toBeNull();
    expect(g.level()).toBe('high');
  });

  it('every number out of a window is an integer, even from float frame times', () => {
    const g = make({ clock: () => 0 });
    const decisions = drive(g, timeline(1000 / 60, 121));
    expect(decisions.length).toBeGreaterThan(1);
    for (const d of decisions) {
      const w = d.window!;
      for (const value of [
        w.frames,
        w.meanFrameMicroseconds,
        w.worstFrameMicroseconds,
        w.budgetMicroseconds,
        w.climbBudgetMicroseconds,
        d.badStreak,
        d.goodStreak,
      ]) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('the budget belongs to the level: 25 ms is a failure at high and a pass at balanced', () => {
    const atHigh = make({ clock: () => 0 });
    expect(runWindows(atHigh, SLOW_MS, 1, 0).decisions[0]!.window!.overBudget).toBe(true);

    const atBalanced = make({ clock: () => 0, initialLevel: 'balanced' });
    const decisions = runWindows(atBalanced, SLOW_MS, 4, 0).decisions;
    expect(decisions.every((d) => d.window!.overBudget === false)).toBe(true);
    expect(atBalanced.level()).toBe('balanced');
  });

  it('reads the injected clock when the caller has no timestamp', () => {
    let now = 0;
    const g = make({ clock: () => now });
    const seen: QualityLevel[] = [];
    for (let i = 0; i < 41; i++) {
      now = i * SLOW_MS;
      const d = g.observe();
      if (d) seen.push(d.level);
    }
    expect(seen).toEqual(['high', 'balanced']);
  });

  it('does not read the wall clock at all', () => {
    const real = Date.now;
    Date.now = () => {
      throw new Error('the governor must not read Date.now');
    };
    try {
      const g = make({ clock: () => 0 });
      runWindows(g, SLOW_MS, 3, 0);
      expect(g.level()).toBe('balanced');
      g.currentWindow();
      g.rearm();
    } finally {
      Date.now = real;
    }
    expect(Date.now).toBe(real);
  });

  it('a window the caller never reaches produces no decisions at all', () => {
    const g = make({ clock: () => 0, windowMs: 5000 });
    expect(drive(g, timeline(SLOW_MS, 41))).toHaveLength(0);
    expect(g.level()).toBe('high');
  });

  it('one frame per window is a stalled device, not a measurement', () => {
    const g = make({ clock: () => 0, minFramesPerWindow: 30 });
    const decisions = runWindows(g, SLOW_MS, 2, 0).decisions;
    expect(decisions.every((d) => d.reason === 'measuring')).toBe(true);
    expect(g.level()).toBe('high');
  });
});

describe('frame-rate governor: lifecycle', () => {
  it('reset drops the evidence and returns to the level the caller started on', () => {
    const g = make({ clock: () => 0, initialLevel: 'high' });
    const drop = runWindows(g, SLOW_MS, 2, 0);
    expect(g.level()).toBe('balanced');

    g.reset();
    expect(g.level()).toBe('high');
    expect(g.currentWindow()).toBeNull();
    const after = runWindows(g, SLOW_MS, 1, drop.t);
    expect(after.decisions[0]!.level).toBe('high');
    expect(after.decisions[0]!.badStreak).toBe(1);
  });

  it('reset can hand the governor a new starting level', () => {
    const g = make({ clock: () => 0 });
    g.reset('balanced');
    expect(g.level()).toBe('balanced');
  });

  it('rearm climbs out of the static path one rung at a time', () => {
    const g = make({ clock: () => 0, initialLevel: 'static' });
    const decision = g.rearm();
    expect(decision.level).toBe('balanced');
    expect(decision.reason).toBe('re-armed');
    expect(g.level()).toBe('balanced');
  });

  it('rearm does not skip the climb rule', () => {
    const g = make({ clock: () => 0, initialLevel: 'static' });
    g.rearm();
    const climb = runWindows(g, FAST_MS, 3, 0);
    expect(climb.decisions.every((d) => d.changed === false)).toBe(true);
    expect(g.level()).toBe('balanced');
  });

  it('rearm keeps a level it was already below the floor of', () => {
    const g = make({ clock: () => 0, initialLevel: 'balanced' });
    expect(g.rearm().level).toBe('balanced');
  });

  it('exposes the ladder the caller has to apply', () => {
    expect(QUALITY_LEVELS).toEqual(['high', 'balanced', 'static']);
    expect(nextLevelDown('high')).toBe('balanced');
    expect(nextLevelDown('static')).toBe('static');
    expect(nextLevelUp('static')).toBe('balanced');
    expect(nextLevelUp('high')).toBe('high');
    expect(frameBudgetMicrosecondsFor('static')).toBeNull();
    expect(frameBudgetMicrosecondsFor('high')).toBe(16_667);
    expect(frameBudgetMicrosecondsFor('balanced')).toBe(33_333);
  });

  it('a level budget and a budget built from a refresh rate are the same number', () => {
    for (const level of QUALITY_LEVELS.filter((l): l is Exclude<QualityLevel, 'static'> => l !== 'static')) {
      expect(frameBudgetMicrosecondsFor(level)).toBe(frameBudgetMicrosecondsPerSecond(TARGET_FRAMERATE[level]));
    }
    expect(frameBudgetMicrosecondsPerSecond(0)).toBe(0);
    expect(Number.isInteger(frameBudgetMicrosecondsPerSecond(144))).toBe(true);
  });

  it('currentWindow reports the last closed window, for the HUD and telemetry', () => {
    const g = make({ clock: () => 0 });
    expect(g.currentWindow()).toBeNull();
    runWindows(g, SLOW_MS, 1, 0);
    expect(g.currentWindow()!.meanFrameMicroseconds).toBe(25_000);
  });
});
