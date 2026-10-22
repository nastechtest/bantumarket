import { sceneTokens } from '@nastech/ui-3d/tokens';
import { devicePixelRatioCap, type Capability } from '@nastech/ui-3d/quality';

/**
 * Render budget (07 §4.1 `viewer/`).
 *
 * Pixels-per-second is the only honest measure of GPU cost: it folds canvas size, DPR and repaint
 * rate into one number that can be checked against `sceneTokens.maxPixelsPerSecondBudget` before
 * a frame is ever queued. `frameloop="demand"` matters here — static viewing repaints almost
 * never, so a large canvas at rest is inside budget; the budget is what continuous inspection
 * (drag-to-rotate repainting every frame) may not exceed.
 */

export type RenderLevel = 'high' | 'balanced' | 'static';

/**
 * Repaint rates assumed per level. sceneTokens carries the byte ceiling but no fps ladder, so the
 * ladder is local (flagged in the report for the tokens owner to adopt or overrule).
 */
export const FRAME_RATES: Readonly<Record<'high' | 'balanced', number>> = { high: 60, balanced: 30 };

export function devicePixelsPerFrame(cssWidthPx: number, cssHeightPx: number, dpr: number): number {
  return Math.max(0, cssWidthPx) * Math.max(0, cssHeightPx) * dpr * dpr;
}

export function pixelsPerSecond(cssWidthPx: number, cssHeightPx: number, dpr: number, fps: number): number {
  return devicePixelsPerFrame(cssWidthPx, cssHeightPx, dpr) * fps;
}

/** Continuous-repaint fps the canvas can sustain inside the budget; Infinity for a 0-area canvas. */
export function maxSustainedFps(
  cssWidthPx: number,
  cssHeightPx: number,
  dpr: number,
  budget: number = sceneTokens.maxPixelsPerSecondBudget,
): number {
  const perFrame = devicePixelsPerFrame(cssWidthPx, cssHeightPx, dpr);
  if (perFrame <= 0) return Number.POSITIVE_INFINITY;
  return budget / perFrame;
}

export interface CanvasCssSize {
  readonly width: number;
  readonly height: number;
}

/**
 * `high | balanced | static` for this device × canvas. Reduced motion is `static` unconditionally:
 * the ban on unrequested motion is a product rule (spec §13.2), not a performance hint — a buyer
 * can still drag; nothing may animate at them.
 *
 * Read `static` as a repaint-rate tier, never as "no scene": the model still mounts and still
 * drags. On this reading the tier cliffs are low (dpr 2: `high` to ~104² css px, `balanced` to
 * ~147², `static` beyond), so a normal 300² canvas is `static` — 2.6 M px/s sustains ~7 fps there.
 * If the tokens owner means 2.6 M device pixels *per frame* (~806² css at dpr 2, which matches the
 * frameFill reference canvas), the fix is to drop the `fps` factor here and in `maxSustainedFps`,
 * not to inflate the token. Flagged in brief-01-report §7.3.
 */
export function levelFor(cap: Capability, size: CanvasCssSize): RenderLevel {
  if (cap.prefersReducedMotion) return 'static';
  if (cap.gl === 'none') return 'static';
  const dpr = devicePixelRatioCap(cap);
  const budget = sceneTokens.maxPixelsPerSecondBudget;
  if (pixelsPerSecond(size.width, size.height, dpr, FRAME_RATES.high) <= budget) return 'high';
  if (pixelsPerSecond(size.width, size.height, dpr, FRAME_RATES.balanced) <= budget) return 'balanced';
  return 'static';
}

/** The per-frame ms budget the governor should police for a given render level. */
export function governorFrameBudgetMs(level: RenderLevel): number {
  switch (level) {
    case 'high':
      return 1000 / FRAME_RATES.high;
    case 'balanced':
      return 1000 / FRAME_RATES.balanced;
    case 'static':
      // Static means repaint-on-interaction with no rate target; police at the reference-device
      // 30 Hz floor so an over-eager invalidate loop is still caught.
      return 1000 / 30;
  }
}
