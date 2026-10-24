/**
 * Focus verification at the rig.
 *
 * Auto-QC measures sharpness over the sharpest quartile of the whole session. That is the right
 * aggregate for "can this bake be trusted", and the wrong one for "which frame is soft": one blurred
 * frame in a turntable leaves a smeared sector in the texture, and the quartile score barely moves.
 * So the station checks every frame before transfer and names the soft ones.
 *
 * A small number of soft frames at the start or end of a revolution is common (the rig is still
 * settling). More than `maxSoftFraction` — or any soft frame in the middle of the ring — is a
 * focus fault the operator fixes now.
 */

import { qcGateFailed } from '../errors.js';
import type { QcGateFailureBrief } from '../errors.js';

export interface FrameFocus {
  readonly frame: string;
  /** Normalised sharpness, 0–1, from the rig's focus metric. */
  readonly sharpness: number;
}

export interface FocusThresholds {
  readonly minSharpness: number;
  readonly maxSoftFraction: number;
  /** Soft frames allowed at each end while the rig settles; a soft frame inside the ring is fatal. */
  readonly edgeAllowance: number;
  readonly minFrames: number;
}

export const DEFAULT_FOCUS_THRESHOLDS: FocusThresholds = {
  minSharpness: 0.32,
  maxSoftFraction: 0.1,
  edgeAllowance: 2,
  minFrames: 12,
};

export interface FocusVerdict {
  readonly ok: boolean;
  readonly frameCount: number;
  readonly softFrames: readonly string[];
  readonly softFraction: number;
  readonly minSharpness: number;
  readonly medianSharpness: number;
  /** Soft frames that are neither at the start nor at the end. */
  readonly interiorSoftFrames: readonly string[];
  readonly failures: readonly QcGateFailureBrief[];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function verifyFocus(
  frames: readonly FrameFocus[],
  thresholds: FocusThresholds = DEFAULT_FOCUS_THRESHOLDS,
): FocusVerdict {
  const failures: QcGateFailureBrief[] = [];
  const badReadings = frames.filter((f) => !Number.isFinite(f.sharpness) || f.sharpness < 0 || f.sharpness > 1);
  for (const frame of badReadings) {
    failures.push({ label: `sharpness ${frame.frame}`, measured: String(frame.sharpness), required: '0–1' });
  }
  const usable = frames.filter((f) => Number.isFinite(f.sharpness) && f.sharpness >= 0 && f.sharpness <= 1);
  if (usable.length !== 0 && usable.length < thresholds.minFrames) {
    failures.push({ label: 'frame count', measured: `${usable.length} frames`, required: `>= ${thresholds.minFrames} frames` });
  }
  const soft = usable.filter((f) => f.sharpness < thresholds.minSharpness);
  const softFraction = usable.length === 0 ? 0 : soft.length / usable.length;
  const interior = usable
    .map((frame, index) => ({ frame, index }))
    .filter(({ frame, index }) => frame.sharpness < thresholds.minSharpness
      && index >= thresholds.edgeAllowance
      && index < usable.length - thresholds.edgeAllowance)
    .map(({ frame }) => frame.frame);

  if (usable.length === 0) {
    failures.push({ label: 'sharpness', measured: 'no readable frames', required: 'a session of measured frames' });
  }
  if (softFraction > thresholds.maxSoftFraction) {
    failures.push({
      label: 'soft frames',
      measured: `${(softFraction * 100).toFixed(1)} %`,
      required: `<= ${(thresholds.maxSoftFraction * 100).toFixed(1)} %`,
    });
  }
  if (interior.length > 0) {
    failures.push({
      label: 'soft frames inside the revolution',
      measured: interior.join(', '),
      required: 'none — focus must not drift mid-turn',
    });
  }

  const sharpnessValues = usable.map((f) => f.sharpness);
  return {
    ok: failures.length === 0,
    frameCount: frames.length,
    softFrames: Object.freeze(soft.map((f) => f.frame)),
    softFraction,
    minSharpness: sharpnessValues.length === 0 ? 0 : Math.min(...sharpnessValues),
    medianSharpness: sharpnessValues.length === 0 ? 0 : median(sharpnessValues),
    interiorSoftFrames: Object.freeze(interior),
    failures: Object.freeze(failures),
  };
}

export function assertFocus(verdict: FocusVerdict): void {
  if (!verdict.ok) {
    throw qcGateFailed(verdict.failures, 'Re-focus and re-shoot the named frames. Do not drop the soft frames: a gap in the ring is a hole in the mesh.');
  }
}
