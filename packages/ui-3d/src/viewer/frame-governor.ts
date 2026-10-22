import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

/**
 * Frame governor (07 §4.1 `viewer/`, failure mode 2: the 4-second freeze).
 *
 * A scene that keeps rendering when the frame budget is blown is how a 3D page freezes the whole
 * tab. The governor measures frame intervals over a sliding window and, on SUSTAINED overrun,
 * steps quality down a fixed ladder — DPR → pixel scale → LOD → stop the loop — instead of
 * silently dropping frames. Dropping frames hides the problem; stepping down keeps the page
 * interactive, which is the actual promise.
 *
 * `frameloop="demand"` means nothing renders unless `invalidate()` is called: at the bottom of
 * the ladder the governor simply stops calling it, and that is the only reliable way to stop the
 * loop from inside a demand-mode canvas.
 */

export type GovernorLevel = 'full' | 'dpr' | 'pixel' | 'lod' | 'stopped';

export const LEVEL_LADDER: readonly GovernorLevel[] = ['full', 'dpr', 'pixel', 'lod', 'stopped'];

/** Pixel-ratio multipliers applied to the session DPR cap at each rung. */
export const PIXEL_RATIO_SCALE: Readonly<Record<GovernorLevel, number>> = {
  full: 1,
  dpr: 0.75,
  pixel: 0.55,
  lod: 0.55,
  stopped: 0,
};

export interface FrameGovernorOptions {
  readonly now: () => number;
  /** Per-frame time budget; overrun is measured against this, not against 60 Hz. */
  readonly frameBudgetMs?: number;
  readonly windowSize?: number;
  /** Mean interval above budget × ratio counts the window as an overrun. */
  readonly overrunRatio?: number;
  /** Consecutive overrun windows before the level steps down (never fewer than 1). */
  readonly sustainedWindows?: number;
  /** Intervals above this are tab stalls (backgrounding), not render overruns. */
  readonly stallMs?: number;
  readonly onLevelChange?: (level: GovernorLevel) => void;
}

export interface GovernorStats {
  readonly level: GovernorLevel;
  readonly avgFrameMs: number | null;
  readonly windowsCompleted: number;
  readonly samples: number;
}

const DEFAULTS = { frameBudgetMs: 1000 / 30, windowSize: 20, overrunRatio: 1.4, sustainedWindows: 2, stallMs: 500 } as const;

export class FrameGovernor {
  private readonly now: () => number;
  private readonly frameBudgetMs: number;
  private readonly windowSize: number;
  private readonly overrunRatio: number;
  private readonly sustainedWindows: number;
  private readonly stallMs: number;
  private readonly onLevelChange: ((level: GovernorLevel) => void) | undefined;

  private intervals: number[] = [];
  private lastStamp: number | null = null;
  private streak = 0;
  private levelIndex = 0;
  private windowsCompleted = 0;
  private lastAvgFrameMs: number | null = null;

  constructor(options: FrameGovernorOptions) {
    this.now = options.now;
    this.frameBudgetMs = options.frameBudgetMs ?? DEFAULTS.frameBudgetMs;
    this.windowSize = Math.max(2, options.windowSize ?? DEFAULTS.windowSize);
    this.overrunRatio = options.overrunRatio ?? DEFAULTS.overrunRatio;
    this.sustainedWindows = Math.max(1, options.sustainedWindows ?? DEFAULTS.sustainedWindows);
    this.stallMs = options.stallMs ?? DEFAULTS.stallMs;
    this.onLevelChange = options.onLevelChange;
  }

  /** Call exactly once per rendered frame. Pure against the injected clock — no rAF needed. */
  tick(): void {
    if (this.level() === 'stopped') return;
    const stamp = this.now();
    if (this.lastStamp !== null) {
      const delta = stamp - this.lastStamp;
      // A stall is the tab being backgrounded, not the GPU failing: counting it would step the
      // level down for something the buyer did on purpose.
      if (delta <= this.stallMs) this.intervals.push(delta);
    }
    this.lastStamp = stamp;

    if (this.intervals.length >= this.windowSize) this.completeWindow();
  }

  private completeWindow(): void {
    const sum = this.intervals.reduce((a, b) => a + b, 0);
    const avg = sum / this.intervals.length;
    this.intervals = [];
    this.lastAvgFrameMs = avg;
    this.windowsCompleted++;
    if (avg > this.frameBudgetMs * this.overrunRatio) this.streak++;
    else this.streak = 0;

    // Deliberately one-directional: recovering the level when frames improve oscillates visibly
    // (DPR pumping is readable as flicker) and the only signal we trust is "we were fine all
    // along", which the buyer already has — the static path never degraded in the first place.
    if (this.streak >= this.sustainedWindows) this.stepDown();
  }

  private stepDown(): void {
    this.streak = 0;
    if (this.levelIndex >= LEVEL_LADDER.length - 1) return;
    this.levelIndex++;
    this.onLevelChange?.(LEVEL_LADDER[this.levelIndex] as GovernorLevel);
  }

  level(): GovernorLevel {
    return LEVEL_LADDER[this.levelIndex] as GovernorLevel;
  }

  stats(): GovernorStats {
    return {
      level: this.level(),
      avgFrameMs: this.lastAvgFrameMs,
      windowsCompleted: this.windowsCompleted,
      samples: this.intervals.length,
    };
  }

  reset(): void {
    this.intervals = [];
    this.lastStamp = null;
    this.streak = 0;
    this.levelIndex = 0;
    this.windowsCompleted = 0;
    this.lastAvgFrameMs = null;
  }
}

/**
 * Drive the governor from inside a demand-mode Canvas: feed ticks, apply the DPR/pixel rungs to
 * the renderer, and stop calling invalidate() at the bottom of the ladder — in demand mode that
 * IS stopping the loop. Must be rendered as a child of the Canvas.
 */
export function useGovernorLoop(governor: FrameGovernor, baseDpr: number): void {
  const levelRef = useRef<GovernorLevel>(governor.level());

  useEffect(() => {
    levelRef.current = governor.level();
  }, [governor]);

  useFrame((state) => {
    governor.tick();
    const level = governor.level();
    if (level === 'stopped') return;
    if (level !== levelRef.current) {
      levelRef.current = level;
      const scale = PIXEL_RATIO_SCALE[level];
      // setSize with the same css size re-applies the new pixel ratio cleanly; updateStyle=false
      // so the canvas never re-lays out on a quality step (a resize mid-drag reads as a glitch).
      state.gl.setPixelRatio(baseDpr * scale);
      state.gl.setSize(state.size.width, state.size.height, false);
    }
    // In demand mode this single call is the loop: keep invalidating while alive, stop at the
    // bottom rung, and nothing renders.
    state.invalidate();
  });
}
