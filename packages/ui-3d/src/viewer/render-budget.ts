import { sceneTokens } from '@nastech/ui-3d/tokens';
import { continuousRepaintBudgetScale, devicePixelRatioCap, type Capability } from '@nastech/ui-3d/quality';

/**
 * Render budget (07 §4.1 `viewer/`).
 *
 * Pixels-per-second is the only honest measure of GPU cost: it folds canvas size, DPR and repaint
 * rate into one number that can be checked against a device's share of
 * `sceneTokens.maxPixelsPerSecondBudget` before a frame is ever queued. `frameloop="demand"`
 * matters here — static viewing repaints almost never, so a large canvas at rest is inside budget;
 * the budget is what continuous inspection (drag-to-rotate repainting every frame) may not exceed.
 *
 * It is a *prior*, not a measurement: it counts pixels and cannot price a shader. The frame-rate
 * governor owns the measured verdict and will downgrade a device this table was generous about.
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

/** This device's share of the reference ceiling, in device pixels repainted per second. */
export function pixelBudgetFor(cap: Capability): number {
  return sceneTokens.maxPixelsPerSecondBudget * continuousRepaintBudgetScale(cap);
}

/** Continuous-repaint fps this canvas sustains inside this device's budget; Infinity for a 0-area canvas. */
export function maxSustainedFps(
  cssWidthPx: number,
  cssHeightPx: number,
  dpr: number,
  cap: Capability,
): number {
  const perFrame = devicePixelsPerFrame(cssWidthPx, cssHeightPx, dpr);
  if (perFrame <= 0) return Number.POSITIVE_INFINITY;
  return pixelBudgetFor(cap) / perFrame;
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
 * drags. A 350² css canvas at DPR 2 is `high` on a webgl2 device (29.4 Mpx/s against a 156 Mpx/s
 * ceiling) and `balanced` on a 3 GB phone, whose share is 62.4 Mpx/s and does not reach 60 Hz.
 */
export function levelFor(cap: Capability, size: CanvasCssSize): RenderLevel {
  if (cap.prefersReducedMotion) return 'static';
  if (cap.gl === 'none') return 'static';
  const dpr = devicePixelRatioCap(cap);
  const budget = pixelBudgetFor(cap);
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
