/**
 * Auto-QC gates.
 *
 * Each gate returns the number it measured next to the number it needed. A bare boolean is not
 * reviewable: the operator has to know whether sharpness missed by 0.01 or by half, and a dispute
 * reading the history later reads the measurement, not the judgement.
 *
 * Thresholds are data (`DEFAULT_QC_THRESHOLDS`, overridable per session) rather than constants
 * scattered through conditionals, because the pilot will tune them and a tuned threshold that lives
 * inside an `if` is a threshold nobody can audit.
 *
 * Gates are classed, and the class decides what the evidence can support: a broken mesh means the
 * render misrepresents the object, so it evidences nothing. A soft gate (blurry, blown highlights)
 * means the shape is sound but the surface reading is not. That mapping is what keeps `claim_scope`
 * from exceeding the evidence in `manifest-build.ts`.
 */

import { readdirSync } from 'node:fs';
import type { ClaimScope } from '@nastech/api-contracts';
import { inputInvalid, qcGateFailed } from './errors.js';

export type GateId =
  | 'coverage'
  | 'sharpness'
  | 'exposure'
  | 'highlight_clip'
  | 'mesh_holes'
  | 'non_manifold'
  | 'texture_bleed'
  | 'silhouette_poster';

/**
 * `geometry_integrity` failures strip the render's right to claim anything about the object.
 * `surface_fidelity` failures strip the condition claim but leave geometry. `acquisition` failures
 * mean there is not enough input for either.
 */
export type GateClass = 'acquisition' | 'geometry_integrity' | 'surface_fidelity';

export interface QcThresholds {
  readonly coverageFramesMin: number;
  readonly sharpnessMin: number;
  readonly exposureMeanMin: number;
  readonly exposureMeanMax: number;
  readonly highlightClipFractionMax: number;
  readonly meshHoleCountMax: number;
  readonly nonManifoldCountMax: number;
  readonly textureBleedRatioMax: number;
  readonly silhouetteIouMin: number;
}

/** 12-frame turntable is the floor the static path already meets; 40 is what a photogrammetry pass needs to close the mesh. */
export const DEFAULT_QC_THRESHOLDS: QcThresholds = {
  coverageFramesMin: 40,
  sharpnessMin: 0.32,
  exposureMeanMin: 0.35,
  exposureMeanMax: 0.75,
  highlightClipFractionMax: 0.02,
  meshHoleCountMax: 0,
  nonManifoldCountMax: 4,
  textureBleedRatioMax: 0.015,
  silhouetteIouMin: 0.9,
};

export interface QcMeasurements {
  readonly frameCount: number;
  /** Normalised blur score over the sharpest quartile of frames, 0–1. */
  readonly sharpnessScore: number;
  /** Mean luma of the reference frame, 0–1. */
  readonly exposureMean: number;
  /** Fraction of pixels clipped to white, 0–1. */
  readonly highlightClipFraction: number;
  readonly holeCount: number;
  readonly nonManifoldCount: number;
  /** Share of texels whose bake pulls colour across a UV island edge, 0–1. */
  readonly textureBleedRatio: number;
  /** Overlap between the render's silhouette and the accepted poster silhouette, 0–1. */
  readonly silhouetteIou: number;
}

export type Comparator = 'min' | 'max' | 'between';

export interface GateResult {
  readonly id: GateId;
  readonly label: string;
  readonly gateClass: GateClass;
  readonly measured: number;
  readonly unit: string;
  readonly comparator: Comparator;
  readonly threshold: number | readonly [number, number];
  readonly pass: boolean;
  /** Signed headroom in the gate's own unit: negative is how far it missed. */
  readonly margin: number;
  readonly why: string;
}

interface GateSpec {
  readonly id: GateId;
  readonly label: string;
  readonly unit: string;
  readonly gateClass: GateClass;
  readonly comparator: Comparator;
  readonly threshold: (t: QcThresholds) => number | readonly [number, number];
  readonly measure: (m: QcMeasurements) => number;
  readonly why: string;
}

export const GATES: readonly GateSpec[] = [
  {
    id: 'coverage',
    label: 'Frame coverage',
    unit: 'frames',
    gateClass: 'acquisition',
    comparator: 'min',
    threshold: (t) => t.coverageFramesMin,
    measure: (m) => m.frameCount,
    why: 'Below the frame minimum the mesh closes on guesses, and a guessed surface is not evidence of condition.',
  },
  {
    id: 'sharpness',
    label: 'Sharpness',
    unit: 'score',
    gateClass: 'surface_fidelity',
    comparator: 'min',
    threshold: (t) => t.sharpnessMin,
    measure: (m) => m.sharpnessScore,
    why: 'A blurred bake hides scratches and polish marks — the two things a watch buyer disputes over.',
  },
  {
    id: 'exposure',
    label: 'Exposure',
    unit: 'mean luma',
    gateClass: 'surface_fidelity',
    comparator: 'between',
    threshold: (t) => [t.exposureMeanMin, t.exposureMeanMax] as const,
    measure: (m) => m.exposureMean,
    why: 'Off-exposure frames shift the recorded colour of the dial and bezel; colour is a condition claim.',
  },
  {
    id: 'highlight_clip',
    label: 'Clipped highlights',
    unit: 'fraction',
    gateClass: 'surface_fidelity',
    comparator: 'max',
    threshold: (t) => t.highlightClipFractionMax,
    measure: (m) => m.highlightClipFraction,
    why: 'White-blown steel reads as unscratched. On a watch this is the most common way a render lies.',
  },
  {
    id: 'mesh_holes',
    label: 'Mesh holes',
    unit: 'open edges',
    gateClass: 'geometry_integrity',
    comparator: 'max',
    threshold: (t) => t.meshHoleCountMax,
    measure: (m) => m.holeCount,
    why: 'A hole in the case is a missing part of the object. Nothing about the shape can be claimed from it.',
  },
  {
    id: 'non_manifold',
    label: 'Non-manifold geometry',
    unit: 'edges',
    gateClass: 'geometry_integrity',
    comparator: 'max',
    threshold: (t) => t.nonManifoldCountMax,
    measure: (m) => m.nonManifoldCount,
    why: 'Non-manifold edges make the silhouette depend on the viewer path, so geometry stops being stable.',
  },
  {
    id: 'texture_bleed',
    label: 'Texture bleed',
    unit: 'fraction',
    gateClass: 'surface_fidelity',
    comparator: 'max',
    threshold: (t) => t.textureBleedRatioMax,
    measure: (m) => m.textureBleedRatio,
    why: 'Colour pulled across a UV seam paints one part of the watch with another part’s damage.',
  },
  {
    id: 'silhouette_poster',
    label: 'Silhouette vs poster',
    unit: 'IoU',
    gateClass: 'geometry_integrity',
    comparator: 'min',
    threshold: (t) => t.silhouetteIouMin,
    measure: (m) => m.silhouetteIou,
    why: 'The static photo is the agreed truth of the outline. A render that disagrees is a different object.',
  },
];

function marginFor(comparator: Comparator, measured: number, threshold: number | readonly [number, number]): number {
  if (comparator === 'min') return measured - (threshold as number);
  if (comparator === 'max') return (threshold as number) - measured;
  const [lo, hi] = threshold as readonly [number, number];
  if (measured < lo) return measured - lo;
  if (measured > hi) return measured - hi;
  return Math.min(measured - lo, hi - measured);
}

function passes(comparator: Comparator, measured: number, threshold: number | readonly [number, number]): boolean {
  if (comparator === 'min') return measured >= (threshold as number);
  if (comparator === 'max') return measured <= (threshold as number);
  const [lo, hi] = threshold as readonly [number, number];
  return measured >= lo && measured <= hi;
}

export function formatGateValue(unit: string, value: number): string {
  if (unit === 'frames' || unit === 'open edges' || unit === 'edges') return `${value} ${unit}`;
  return `${value.toFixed(4)} ${unit}`;
}

function requiredText(comparator: Comparator, unit: string, threshold: number | readonly [number, number]): string {
  if (comparator === 'min') return `>= ${formatGateValue(unit, threshold as number)}`;
  if (comparator === 'max') return `<= ${formatGateValue(unit, threshold as number)}`;
  const [lo, hi] = threshold as readonly [number, number];
  return `between ${formatGateValue(unit, lo)} and ${formatGateValue(unit, hi)}`;
}

/** Validate the measurement sheet before any gate reads it — a missing field must not default to a pass. */
export function assertMeasurements(m: QcMeasurements): void {
  const numbers: readonly (keyof QcMeasurements)[] = [
    'frameCount', 'sharpnessScore', 'exposureMean', 'highlightClipFraction',
    'holeCount', 'nonManifoldCount', 'textureBleedRatio', 'silhouetteIou',
  ];
  for (const key of numbers) {
    const value = m[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw inputInvalid(`QC measurement "${key}" is ${JSON.stringify(value)}, not a finite number.`, 'Every gate needs a measured number; a blank reading is a failed reading, never a passing one.');
    }
    if (value < 0) throw inputInvalid(`QC measurement "${key}" is negative (${value}).`, 'These are magnitudes; a negative reading means the measuring tool misreported.');
  }
  for (const key of ['sharpnessScore', 'exposureMean', 'highlightClipFraction', 'textureBleedRatio', 'silhouetteIou'] as const) {
    if (m[key] > 1) throw inputInvalid(`QC measurement "${key}" is ${m[key]}, outside 0–1.`, 'Normalise the reading before submitting it, or the gate compares against a threshold in a different unit.');
  }
  if (!Number.isInteger(m.frameCount)) throw inputInvalid(`Frame count ${m.frameCount} is not a whole number.`, 'Frames are counted, not estimated.');
}

export function evaluateGates(measurements: QcMeasurements, thresholds: QcThresholds = DEFAULT_QC_THRESHOLDS): GateResult[] {
  assertMeasurements(measurements);
  return GATES.map((gate) => {
    const measured = gate.measure(measurements);
    const threshold = gate.threshold(thresholds);
    return {
      id: gate.id,
      label: gate.label,
      gateClass: gate.gateClass,
      measured,
      unit: gate.unit,
      comparator: gate.comparator,
      threshold,
      pass: passes(gate.comparator, measured, threshold),
      margin: marginFor(gate.comparator, measured, threshold),
      why: gate.why,
    };
  });
}

/**
 * The narrowest scope the evidence supports. Worst class wins: a geometry-integrity failure drops
 * the render to decoration, a soft failure drops it to outer condition, and no metric alignment
 * means the size of the thing is unproven, so nothing about geometry is claimed.
 */
export function scopeSupportedByEvidence(
  results: readonly GateResult[],
  alignment: { readonly withinWindow: boolean } | null,
): ClaimScope {
  if (results.some((r) => !r.pass && (r.gateClass === 'geometry_integrity' || r.gateClass === 'acquisition'))) {
    return 'none';
  }
  if (results.some((r) => !r.pass && r.gateClass === 'surface_fidelity')) return 'condition_only';
  if (alignment === null || !alignment.withinWindow) return 'condition_only';
  return 'geometry_and_external_condition';
}

export type AutoQcVerdict = 'pass' | 'fail';

export interface QcReport {
  readonly verdict: AutoQcVerdict;
  readonly results: readonly GateResult[];
  readonly failing: readonly GateResult[];
  readonly scopeSupported: ClaimScope;
  readonly measuredAt: string;
  readonly thresholds: QcThresholds;
}

export function runAutoQc(
  measurements: QcMeasurements,
  opts: { readonly thresholds?: QcThresholds; readonly aligned: boolean; readonly measuredAt: string } = { aligned: false, measuredAt: new Date().toISOString() },
): QcReport {
  const thresholds = opts.thresholds ?? DEFAULT_QC_THRESHOLDS;
  const results = evaluateGates(measurements, thresholds);
  const failing = results.filter((r) => !r.pass);
  return {
    verdict: failing.length === 0 ? 'pass' : 'fail',
    results: Object.freeze(results),
    failing: Object.freeze(failing),
    scopeSupported: scopeSupportedByEvidence(results, { withinWindow: opts.aligned }),
    measuredAt: opts.measuredAt,
    thresholds,
  };
}

/** The operator's next action depends on which class failed, so the refusal says which. */
export function refuseFromQc(report: QcReport): never {
  const brief = report.failing.map((f) => ({ label: f.label, measured: formatGateValue(f.unit, f.measured), required: requiredText(f.comparator, f.unit, f.threshold) }));
  const next = report.failing.some((f) => f.gateClass === 'geometry_integrity' || f.gateClass === 'acquisition')
    ? 'This session needs a re-shoot, not a fix in post. Move it to reshot.'
    : 'Re-process the bake: the frames are usable, the surface reading is not.';
  throw qcGateFailed(brief, next);
}

const FRAME_FILE = /\.(jpe?g|png|tif|tiff|exr|dng)$/i;

/**
 * Frame count from the session directory, counted rather than declared — coverage is the one gate
 * the studio can verify with a filesystem listing instead of an operator's arithmetic.
 */
export function countFrames(sessionDir: string): number {
  let entries: string[];
  try {
    entries = readdirSync(sessionDir);
  } catch {
    throw inputInvalid(`Session directory "${sessionDir}" cannot be read.`, 'Point --session at the directory the turntable wrote its frames into.');
  }
  const frames = entries.filter((name) => FRAME_FILE.test(name)).length;
  if (frames === 0) throw inputInvalid(`No image frames found in "${sessionDir}".`, 'A capture session with no frames is not a capture; check the export step ran.');
  return frames;
}

export function describeGateResult(result: GateResult): string {
  const state = result.pass ? 'pass' : 'FAIL';
  return `${state.padEnd(4)} ${result.label.padEnd(22)} ${formatGateValue(result.unit, result.measured).padStart(14)}  needs ${requiredText(result.comparator, result.unit, result.threshold)}`;
}
