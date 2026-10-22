/**
 * Frame-rate governor (07 §4.1 `quality/`) — the pure half of what `viewer/frame-governor.ts` wires
 * to rAF. It owns no timer and reads no clock of its own: the caller pushes the timestamp it was
 * given (the rAF timestamp in production, a scripted array in tests) and the governor answers with
 * the next level and the reason.
 *
 * Two decisions are load-bearing and both come from the shape of the failure, not from taste:
 *
 * 1. **The hysteresis is asymmetric.** Falling costs the buyer a slightly softer image; climbing
 *    costs a re-fetch of a multi-megabyte asset plus a shader compile on the device that just
 *    proved it was struggling, which they feel as a stall. So two bad windows to step down, four
 *    good windows to step up, and one rung at a time. A governor that flaps is worse than one that
 *    stays down.
 * 2. **The frame budget belongs to the level, not to the page.** Measured against 60 fps, a scene
 *    that has just been dropped to 30 fps still looks like a failure two windows later and the
 *    governor falls straight through to `static` — a step down that never earns its keep is a
 *    way to switch 3D off by accident. And the bar for climbing back up is the level being asked
 *    for, not the one being left: falling is judged by where you are, climbing by where you want to
 *    be, because "no problem here" is not the same evidence as "this device can hold 60 fps".
 *
 * Everything the governor reports is an integer count of microseconds. Frame intervals arrive as
 * floats and a mean of floats accumulates exactly the kind of `0.30000000000000004` that makes two
 * runs of the same timeline disagree about whether a device is slow; rounding at the boundary of
 * the window removes that class of bug rather than tolerating it.
 */

export type QualityLevel = 'high' | 'balanced' | 'static';

/** Coarse-to-fine, index 0 being the richest. `static` is the complete static path, not a failure
 *  state — see shared context rule 1. */
export const QUALITY_LEVELS: readonly QualityLevel[] = ['high', 'balanced', 'static'];

/** The per-level frame targets. 60 is the display; 30 is the number a mid-range Android holds while
 *  also decoding a 2 MB asset, and it is the rung that keeps a scene alive rather than killing it. */
export const TARGET_FRAMERATE: Readonly<Record<Exclude<QualityLevel, 'static'>, number>> = {
  high: 60,
  balanced: 30,
};

export const GOVERNOR_TUNING = {
  /** 500 ms is ~30 frames at 60 fps: long enough that one 80 ms garbage collection does not read
   *  as a slow device, short enough that a real stall is caught inside half a second. */
  windowMs: 500,
  /** A window with fewer frames than this is not a measurement, it is a paused tab. */
  minFramesPerWindow: 12,
  badWindowsToStepDown: 2,
  goodWindowsToStepUp: 4,
  /** Longer than this is a background tab or a phone locked mid-inspection, not a dropped frame.
   *  Discarded rather than counted — see `observe`. */
  maxPlausibleFrameMs: 1000,
  /** Ring capacity. 512 frames is ~8 s at 60 fps, so the window can never overwrite live evidence. */
  ringCapacityFrames: 512,
  microsecondsPerMillisecond: 1000,
} as const;

export type Clock = () => number;

export interface GovernorOptions {
  /**
   * Required: a governor that reads `Date.now()` internally cannot be driven by a scripted frame
   *  timeline, and a scripted frame timeline is the only way to prove hysteresis.
   *
   *  The source must be monotonic with millisecond resolution or better — `performance.now()` or the
   *  rAF timestamp, which is what the wiring should pass. A wall clock is survivable (a step
   *  backwards is discarded as a stall, not counted as a slow frame) but it is not the intended
   *  input, and a clock coarser than a millisecond simply measures nothing.
   */
  readonly clock: Clock;
  /** The level the caller's own budget check landed on (`viewer/render-budget.levelFor`). The
   *  governor only moves what it is handed; it does not second-guess the capability probe. */
  readonly initialLevel?: QualityLevel;
  readonly windowMs?: number;
  readonly minFramesPerWindow?: number;
  readonly badWindowsToStepDown?: number;
  readonly goodWindowsToStepUp?: number;
  readonly maxPlausibleFrameMs?: number;
  readonly ringCapacityFrames?: number;
}

export interface WindowReport {
  readonly frames: number;
  readonly meanFrameMicroseconds: number;
  readonly worstFrameMicroseconds: number;
  readonly budgetMicroseconds: number;
  readonly overBudget: boolean;
  /** The budget of the level above this one, i.e. the bar a climb has to clear. Equal to
   *  `budgetMicroseconds` at the top, where there is nothing to climb to. */
  readonly climbBudgetMicroseconds: number;
  readonly climbGrade: boolean;
  /** True when a non-contiguous gap made this window meaningless (hidden tab, lock, seek). */
  readonly stalled: boolean;
}

export type GovernorReason =
  | 'measuring'
  | 'holding'
  | 'stepped-down'
  | 'stepped-up'
  | 'at-floor'
  | 'stalled'
  | 're-armed';

export interface GovernorDecision {
  readonly level: QualityLevel;
  readonly changed: boolean;
  readonly reason: GovernorReason;
  readonly window: WindowReport | null;
  readonly badStreak: number;
  readonly goodStreak: number;
}

export interface FrameRateGovernor {
  /**
   * Push one rendered frame. Returns a decision only when something was actually decided — a window
   * closed or a stall was discarded — so the rAF path allocates once per window instead of once per
   * frame.
   */
  readonly observe: (nowMs?: number) => GovernorDecision | null;
  readonly level: () => QualityLevel;
  readonly currentWindow: () => WindowReport | null;
  /** The app's "the buyer asked for 3D again" signal. See `rearm` below for why this is not automatic. */
  readonly rearm: () => GovernorDecision;
  /** A new scene is not the old scene's evidence. Called when a different model mounts. */
  readonly reset: (level?: QualityLevel) => void;
}

const US_PER_MS = GOVERNOR_TUNING.microsecondsPerMillisecond;

function toMicroseconds(ms: number): number {
  return Math.round(ms * US_PER_MS);
}

/** Frame budget for a target refresh rate, in integer microseconds. Shared with the pixels-per-second
 *  budget so a ceiling expressed as fps and a ceiling expressed as frame time cannot drift apart. */
export function frameBudgetMicrosecondsPerSecond(fps: number): number {
  return fps > 0 ? Math.round((1000 / fps) * US_PER_MS) : 0;
}

/** Frame budget for a level, in integer microseconds, or null where there is nothing to measure. */
export function frameBudgetMicrosecondsFor(level: QualityLevel): number | null {
  if (level === 'static') return null;
  return frameBudgetMicrosecondsPerSecond(TARGET_FRAMERATE[level]);
}

export function nextLevelDown(level: QualityLevel): QualityLevel {
  const i = QUALITY_LEVELS.indexOf(level);
  return i < 0 || i === QUALITY_LEVELS.length - 1 ? level : QUALITY_LEVELS[i + 1]!;
}

export function nextLevelUp(level: QualityLevel): QualityLevel {
  const i = QUALITY_LEVELS.indexOf(level);
  return i <= 0 ? level : QUALITY_LEVELS[i - 1]!;
}

/** The bar a climb has to clear: the next level up, or this one where there is nothing above it. */
function climbBudgetFor(level: QualityLevel): number | null {
  const above = nextLevelUp(level);
  return above === level ? frameBudgetMicrosecondsFor(level) : frameBudgetMicrosecondsFor(above);
}

export function createFrameRateGovernor(options: GovernorOptions): FrameRateGovernor {
  const windowUs = toMicroseconds(options.windowMs ?? GOVERNOR_TUNING.windowMs);
  const minFrames = options.minFramesPerWindow ?? GOVERNOR_TUNING.minFramesPerWindow;
  const downAfter = options.badWindowsToStepDown ?? GOVERNOR_TUNING.badWindowsToStepDown;
  const upAfter = options.goodWindowsToStepUp ?? GOVERNOR_TUNING.goodWindowsToStepUp;
  const maxFrameUs = toMicroseconds(options.maxPlausibleFrameMs ?? GOVERNOR_TUNING.maxPlausibleFrameMs);
  const cap = Math.max(8, Math.round(options.ringCapacityFrames ?? GOVERNOR_TUNING.ringCapacityFrames));

  const initial = options.initialLevel ?? 'high';
  let level: QualityLevel = initial;
  let windowStartUs = 0;
  let lastUs: number | null = null;
  let lastReport: WindowReport | null = null;

  const endAtUs = new Float64Array(cap);
  const intervalUs = new Float64Array(cap);
  let start = 0;
  let size = 0;

  let badStreak = 0;
  let goodStreak = 0;

  function clearRing(): void {
    start = 0;
    size = 0;
  }

  function pushSample(endUs: number, gapUs: number): void {
    const i = (start + size) % cap;
    endAtUs[i] = endUs;
    intervalUs[i] = gapUs;
    if (size < cap) size++;
    else start = (start + 1) % cap; // ring full: oldest evidence is overwritten
  }

  /** Sliding, not tumbling: frames older than the window are dropped on every push, so a window
   *  boundary reads exactly the last `windowUs` of real frames. */
  function trim(tUs: number): void {
    while (size > 0 && tUs - endAtUs[start]! > windowUs) {
      start = (start + 1) % cap;
      size--;
    }
  }

  function report(tUs: number, budgetUs: number | null, climbBudgetUs: number | null, stalled: boolean): WindowReport {
    let sum = 0;
    let worst = 0;
    for (let k = 0; k < size; k++) {
      const v = intervalUs[(start + k) % cap]!;
      sum += v;
      if (v > worst) worst = v;
    }
    const frames = size;
    const mean = frames > 0 ? Math.round(sum / frames) : 0;
    return {
      frames,
      meanFrameMicroseconds: mean,
      worstFrameMicroseconds: Math.round(worst),
      budgetMicroseconds: budgetUs ?? 0,
      overBudget: budgetUs !== null && mean > budgetUs,
      climbBudgetMicroseconds: climbBudgetUs ?? 0,
      climbGrade: climbBudgetUs !== null && mean <= climbBudgetUs,
      stalled: stalled || (tUs - windowStartUs > windowUs * 2 && frames < minFrames),
    };
  }

  function decide(reason: GovernorReason, changed: boolean, window: WindowReport | null): GovernorDecision {
    return { level, changed, reason, window, badStreak, goodStreak };
  }

  function closeWindow(tUs: number): GovernorDecision {
    const budgetUs = frameBudgetMicrosecondsFor(level);
    // Falling is judged against the level you are on; climbing against the level you want. One bar
    // for both is what makes a governor flap: a device pinned at 25 ms/frame is fine at 30 fps and
    // hopeless at 60, so with a single budget it is promoted back to `high` on evidence that `high`
    // immediately disproves. A climb therefore has to be evidence for the climb, not merely the
    // absence of a problem.
    const climbTarget = nextLevelUp(level);
    const climbBudgetUs = climbBudgetFor(level);
    const window = report(tUs, budgetUs, climbBudgetUs, false);
    windowStartUs = tUs;

    // At the floor there are no scene frames to judge — what arrives here is the page's own loop,
    // and promoting a device on DOM frame timings would re-fetch a 2 MB asset nobody asked for.
    if (level === 'static' || budgetUs === null) return decide('at-floor', false, window);

    if (window.frames < minFrames) return decide('measuring', false, window);

    if (window.overBudget) {
      badStreak++;
      goodStreak = 0;
      if (badStreak >= downAfter) {
        const target = nextLevelDown(level);
        if (target !== level) {
          level = target;
          badStreak = 0;
          // The samples in the ring were produced under the old load; keeping them would let a
          // single dip spend the evidence for two steps.
          clearRing();
          windowStartUs = tUs;
          // The window reported is the one that earned the move, not the empty one after it —
          // telemetry reads "why did we drop" and the answer has to be the evidence.
          return decide('stepped-down', true, window);
        }
      }
      return decide('holding', false, window);
    }

    if (!window.climbGrade) {
      // Comfortable here, not proof of more. Both streaks break: `consecutive` means consecutive.
      badStreak = 0;
      goodStreak = 0;
      return decide('holding', false, window);
    }

    // Clamped at the threshold: at the top of the ladder there is nothing left to earn, and an
    // unbounded counter is a slow leak in a long inspection session.
    goodStreak = Math.min(goodStreak + 1, upAfter);
    badStreak = 0;
    if (goodStreak >= upAfter) {
      if (climbTarget !== level) {
        level = climbTarget;
        goodStreak = 0;
        badStreak = 0;
        clearRing();
        windowStartUs = tUs;
        return decide('stepped-up', true, window);
      }
    }
    return decide('holding', false, window);
  }

  function observe(nowMs?: number): GovernorDecision | null {
    const tUs = toMicroseconds(nowMs ?? options.clock());
    lastReport = null;

    if (lastUs === null) {
      lastUs = tUs;
      windowStartUs = tUs;
      return null;
    }

    const gapUs = tUs - lastUs;
    lastUs = tUs;

    if (gapUs === 0) {
      // Two frames inside the same tick of a millisecond-resolution clock. Nothing is measurable
      // about this one, so it is ignored: a coarse clock has to degrade to holding, never to
      // dropping a buyer to the static path.
      return null;
    }

    if (gapUs < 0 || gapUs > maxFrameUs) {
      // A gap longer than a second (or going backwards — a wall clock stepped by NTP) is a hidden
      // tab, a locked phone or a clock correction. Counting it as a slow frame would strip a buyer
      // their 3D for putting the device in their pocket.
      clearRing();
      windowStartUs = tUs;
      const window = report(tUs, frameBudgetMicrosecondsFor(level), climbBudgetFor(level), true);
      return decide('stalled', false, window);
    }

    pushSample(tUs, gapUs);
    trim(tUs);

    if (tUs - windowStartUs >= windowUs) {
      const decision = closeWindow(tUs);
      lastReport = decision.window;
      return decision;
    }
    return null;
  }

  function rearm(): GovernorDecision {
    // Recovery out of `static` is a user-visible cost (a signed URL fetch plus a compile), so it is
    // the caller's decision. The climb is still one rung at a time: static never jumps to high.
    if (level === 'static') level = 'balanced';
    badStreak = 0;
    goodStreak = 0;
    clearRing();
    const nowUs = toMicroseconds(options.clock());
    windowStartUs = nowUs;
    lastUs = nowUs;
    lastReport = null;
    return decide('re-armed', true, null);
  }

  function reset(next?: QualityLevel): void {
    level = next ?? initial;
    badStreak = 0;
    goodStreak = 0;
    clearRing();
    lastUs = null;
    lastReport = null;
  }

  return {
    observe,
    level: () => level,
    currentWindow: () => lastReport,
    rearm,
    reset,
  };
}
