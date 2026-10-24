/**
 * Station-side lighting gate.
 *
 * Lighting is checked on the rig, before 120 frames are transferred, because a session shot under
 * a flickering tube or with a blown highlight on the bezel cannot be repaired downstream. The gate
 * measures three different failures:
 *
 * - **level**: mean luma outside the window shifts every recorded colour on the dial;
 * - **clipping**: white-blown steel reads as unscratched, which is the most common way a watch
 *   render lies;
 * - **flicker**: frame-to-frame mean luma that swings within one revolution means the mesh bakes
 *   banded colour, and no amount of post fixes a light that was strobing.
 */

import { qcGateFailed } from '../errors.js';
import type { QcGateFailureBrief } from '../errors.js';

export interface FrameLuma {
  readonly frame: string;
  /** Mean luma, 0–1. */
  readonly meanLuma: number;
  /** Fraction of pixels at full white, 0–1. */
  readonly clipFraction: number;
}

export interface LightingThresholds {
  readonly meanLumaMin: number;
  readonly meanLumaMax: number;
  readonly clipFractionMax: number;
  /** Max − min of frame means across the revolution. */
  readonly flickerMax: number;
  readonly minFrames: number;
}

/** Mirrors the auto-QC exposure and highlight gates so the rig and the review agree on the line. */
export const DEFAULT_LIGHTING_THRESHOLDS: LightingThresholds = {
  meanLumaMin: 0.35,
  meanLumaMax: 0.75,
  clipFractionMax: 0.02,
  flickerMax: 0.06,
  minFrames: 12,
};

export interface LightingVerdict {
  readonly ok: boolean;
  readonly frameCount: number;
  readonly meanLuma: number;
  readonly minFrameLuma: number;
  readonly maxFrameLuma: number;
  readonly flicker: number;
  readonly worstClipFraction: number;
  readonly failures: readonly QcGateFailureBrief[];
}

export function checkLighting(
  frames: readonly FrameLuma[],
  thresholds: LightingThresholds = DEFAULT_LIGHTING_THRESHOLDS,
): LightingVerdict {
  const failures: QcGateFailureBrief[] = [];
  if (frames.length < thresholds.minFrames) {
    failures.push({
      label: 'frame count',
      measured: `${frames.length} frames`,
      required: `>= ${thresholds.minFrames} frames`,
    });
  }
  for (const frame of frames) {
    if (!Number.isFinite(frame.meanLuma) || frame.meanLuma < 0 || frame.meanLuma > 1) {
      failures.push({ label: `luma ${frame.frame}`, measured: String(frame.meanLuma), required: '0–1' });
    }
    if (!Number.isFinite(frame.clipFraction) || frame.clipFraction < 0 || frame.clipFraction > 1) {
      failures.push({ label: `clip ${frame.frame}`, measured: String(frame.clipFraction), required: '0–1' });
    }
  }
  const usable = frames.filter((f) => Number.isFinite(f.meanLuma) && Number.isFinite(f.clipFraction));
  if (usable.length === 0) {
    return { ok: false, frameCount: frames.length, meanLuma: 0, minFrameLuma: 0, maxFrameLuma: 0, flicker: 0, worstClipFraction: 0, failures: Object.freeze(failures) };
  }

  const means = usable.map((f) => f.meanLuma);
  const mean = means.reduce((a, b) => a + b, 0) / means.length;
  const min = Math.min(...means);
  const max = Math.max(...means);
  const flicker = max - min;
  const worstClip = Math.max(...usable.map((f) => f.clipFraction));

  if (mean < thresholds.meanLumaMin || mean > thresholds.meanLumaMax) {
    failures.push({
      label: 'mean luma',
      measured: mean.toFixed(3),
      required: `${thresholds.meanLumaMin}–${thresholds.meanLumaMax}`,
    });
  }
  if (worstClip > thresholds.clipFractionMax) {
    failures.push({
      label: 'clipped highlights',
      measured: `${(worstClip * 100).toFixed(2)} %`,
      required: `<= ${(thresholds.clipFractionMax * 100).toFixed(2)} %`,
    });
  }
  if (flicker > thresholds.flickerMax) {
    failures.push({
      label: 'flicker (max − min frame luma)',
      measured: flicker.toFixed(3),
      required: `<= ${thresholds.flickerMax}`,
    });
  }

  return {
    ok: failures.length === 0,
    frameCount: frames.length,
    meanLuma: mean,
    minFrameLuma: min,
    maxFrameLuma: max,
    flicker,
    worstClipFraction: worstClip,
    failures: Object.freeze(failures),
  };
}

/** Throws the same refusal the QC gates throw, so the operator sees one vocabulary everywhere. */
export function assertLighting(verdict: LightingVerdict): void {
  if (!verdict.ok) {
    throw qcGateFailed(verdict.failures, 'Fix the light before shooting again: diffusers on, flicker checked, no bare bulb in the steel.');
  }
}
