/**
 * Turntable linearisation.
 *
 * The rig commands 120 steps of 3°, but a belt drive does not deliver 3° every time: one sector
 * runs 4.5° and another 2.2°, and the mesh solver treats the frames as if they were evenly spaced.
 * The result is a watch that looks slightly stretched on one side and compressed on the other, with
 * no error message anywhere.
 *
 * The station measures the actual angle at every index during commissioning and after any belt or
 * stepper change. This module turns those measurements into a per-step error table and a resample
 * plan. Small errors are corrected by choosing the nearest measured frame for each target angle;
 * errors beyond `maxCorrectionDegrees` are refused, because resampling cannot invent a view that
 * was never photographed.
 */

import { createHash } from 'node:crypto';
import { inputInvalid, stationProtocol } from '../errors.js';
import { canonicalJson } from './protocol.js';

export const DEFAULT_ANGULAR_TOLERANCE_DEGREES = 0.35;
/** Beyond this, a "correction" moves more than a sixth of a frame and the rig needs mechanical work. */
export const MAX_CORRECTION_DEGREES = 1.5;

export interface TurntableReading {
  /** Zero-based position in the revolution. */
  readonly index: number;
  readonly commandedDegrees: number;
  /** Normalised to [0, 360). */
  readonly measuredDegrees: number;
}

export interface LinearisationEntry {
  readonly index: number;
  readonly commandedDegrees: number;
  readonly measuredDegrees: number;
  /** Signed measured − commanded, in degrees. */
  readonly errorDegrees: number;
  readonly withinTolerance: boolean;
}

export interface LinearisationTable {
  readonly steps: number;
  readonly stepDegrees: number;
  readonly entries: readonly LinearisationEntry[];
  readonly maxErrorDegrees: number;
  readonly meanAbsErrorDegrees: number;
  readonly toleranceDegrees: number;
  readonly linear: boolean;
  readonly digest: string;
}

export interface ResampleEntry {
  readonly targetIndex: number;
  readonly targetDegrees: number;
  readonly sourceIndex: number;
  readonly sourceMeasuredDegrees: number;
  readonly errorDegrees: number;
}

export interface ResamplePlan {
  readonly steps: number;
  readonly entries: readonly ResampleEntry[];
  readonly maxErrorDegrees: number;
  readonly needsResample: boolean;
}

function normalise(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Signed shortest distance from a to b in degrees, in (−180, 180]. */
function angularDelta(from: number, to: number): number {
  let delta = normalise(to) - normalise(from);
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

export interface LinearisationOptions {
  readonly steps?: number;
  readonly toleranceDegrees?: number;
  readonly maxCorrectionDegrees?: number;
}

export function buildLinearisationTable(
  readings: readonly TurntableReading[],
  options: LinearisationOptions = {},
): LinearisationTable {
  const steps = options.steps ?? readings.length;
  if (!Number.isInteger(steps) || steps < 12) {
    throw inputInvalid(`A turntable revolution needs at least 12 steps, got ${steps}.`, 'Below the static-path floor there is nothing to linearise.');
  }
  if (readings.length !== steps) {
    throw stationProtocol(
      'Turntable',
      `${readings.length} readings for a ${steps}-step revolution`,
      'Measure every index. An interpolated reading hides exactly the sector that is out of line.',
      { readings: readings.length, steps },
    );
  }
  const tolerance = options.toleranceDegrees ?? DEFAULT_ANGULAR_TOLERANCE_DEGREES;
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw inputInvalid(`Angular tolerance ${tolerance}° is not positive.`, 'A tolerance is a positive angle.');

  const stepDegrees = 360 / steps;
  const seen = new Set<number>();
  let previousUnwrapped = Number.NEGATIVE_INFINITY;
  let turns = 0;

  const entries = readings
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((reading, position) => {
      if (reading.index !== position) {
        throw stationProtocol('Turntable', `index ${reading.index} is missing or duplicated`, 'Indices run 0..steps-1 exactly once; a gap means a frame was lost before linearisation.');
      }
      if (seen.has(reading.index)) throw stationProtocol('Turntable', `index ${reading.index} appears twice`, 'One index is one physical position.');
      seen.add(reading.index);
      if (!Number.isFinite(reading.measuredDegrees) || !Number.isFinite(reading.commandedDegrees)) {
        throw stationProtocol('Turntable', `index ${reading.index} has a non-finite angle`, 'Angles are measured numbers; a blank reading is a failed reading.');
      }
      const commanded = normalise(position * stepDegrees);
      if (Math.abs(angularDelta(reading.commandedDegrees, commanded)) > 0.001) {
        throw stationProtocol(
          'Turntable',
          `index ${position} was commanded ${reading.commandedDegrees}°, expected ${commanded.toFixed(3)}°`,
          'The commanded schedule and the reading order disagree; re-export the measurement log from the rig.',
        );
      }
      // Unwrap through the 0° crossing so the last step sorts after the first. The first reading
      // is centred to (−180, 180] so a table that starts at 359.9° is a −0.1° offset, not a full
      // revolution of error.
      let unwrapped = position === 0
        ? (reading.measuredDegrees > 180 ? reading.measuredDegrees - 360 : reading.measuredDegrees)
        : reading.measuredDegrees + turns * 360;
      if (position > 0 && unwrapped <= previousUnwrapped) unwrapped += 360 * (turns + 1);
      if (unwrapped <= previousUnwrapped) {
        throw stationProtocol(
          'Turntable',
          `index ${position} measures ${reading.measuredDegrees.toFixed(3)}° after ${normalise(previousUnwrapped).toFixed(3)}° — the table ran backwards`,
          'A non-monotonic table is a wiring or direction fault. Fix the rig; do not sort the frames into looking right.',
        );
      }
      turns = Math.floor(unwrapped / 360);
      previousUnwrapped = unwrapped;
      const error = unwrapped - position * stepDegrees;
      return {
        index: position,
        commandedDegrees: Number(commanded.toFixed(6)),
        measuredDegrees: Number(normalise(reading.measuredDegrees).toFixed(6)),
        errorDegrees: Number(error.toFixed(6)),
        withinTolerance: Math.abs(error) <= tolerance,
      };
    });

  const errors = entries.map((e) => Math.abs(e.errorDegrees));
  const maxError = Math.max(...errors);
  const digest = createHash('sha256')
    .update(canonicalJson({ steps, stepDegrees, tolerance, entries }), 'utf8')
    .digest('hex');
  return Object.freeze({
    steps,
    stepDegrees,
    entries: Object.freeze(entries),
    maxErrorDegrees: maxError,
    meanAbsErrorDegrees: errors.reduce((a, b) => a + b, 0) / errors.length,
    toleranceDegrees: tolerance,
    linear: maxError <= tolerance,
    digest,
  });
}

/**
 * Refuse a table that resampling cannot repair. This is the point where an operator is told to fix
 * the belt rather than to trust a warp.
 */
export function assertMechanicallyCorrectable(table: LinearisationTable, maxCorrection: number = MAX_CORRECTION_DEGREES): void {
  if (table.maxErrorDegrees > maxCorrection) {
    throw stationProtocol(
      'Turntable',
      `worst step is ${table.maxErrorDegrees.toFixed(2)}° out, beyond the ${maxCorrection.toFixed(2)}° resampling limit`,
      'Service the turntable (belt tension, stepper coupling) and re-measure. Warping the frames would hide a mechanical fault in the geometry.',
      { maxErrorDegrees: table.maxErrorDegrees, maxCorrection },
    );
  }
}

/** Pick the measured frame nearest each commanded angle. */
export function planResample(table: LinearisationTable): ResamplePlan {
  assertMechanicallyCorrectable(table);
  const entries: ResampleEntry[] = [];
  let previousSource = -1;
  for (let target = 0; target < table.steps; target += 1) {
    const targetDegrees = target * table.stepDegrees;
    let best: { entry: LinearisationEntry; error: number } | null = null;
    for (const entry of table.entries) {
      const measured = entry.measuredDegrees;
      // Compare on the circle so 359.8° is next to 0.2°, not 359.6° away.
      const error = angularDelta(targetDegrees, measured);
      if (best === null || Math.abs(error) < Math.abs(best.error)) best = { entry, error };
    }
    if (best === null) throw stationProtocol('Turntable', 'no measurements to resample', 'Measure the revolution first.');
    if (best.entry.index <= previousSource && target > 0 && best.entry.index !== previousSource) {
      throw stationProtocol(
        'Turntable',
        `target ${target} would reuse frame ${best.entry.index} after frame ${previousSource}`,
        'The revolution does not cover every target angle; re-measure with a full turn.',
      );
    }
    previousSource = best.entry.index;
    entries.push({
      targetIndex: target,
      targetDegrees: Number(targetDegrees.toFixed(6)),
      sourceIndex: best.entry.index,
      sourceMeasuredDegrees: best.entry.measuredDegrees,
      errorDegrees: Number(best.error.toFixed(6)),
    });
  }
  const maxError = entries.reduce((max, e) => Math.max(max, Math.abs(e.errorDegrees)), 0);
  return {
    steps: table.steps,
    entries: Object.freeze(entries),
    maxErrorDegrees: maxError,
    needsResample: !table.linear,
  };
}

export function describeLinearisation(table: LinearisationTable): string {
  const worst = table.entries.reduce((a, b) => (Math.abs(b.errorDegrees) > Math.abs(a.errorDegrees) ? b : a));
  return `Turntable ${table.steps} steps of ${table.stepDegrees.toFixed(3)}°; worst index ${worst.index} at ${worst.measuredDegrees.toFixed(2)}° (${worst.errorDegrees.toFixed(2)}°); ${table.linear ? 'within tolerance' : 'needs resampling'} (tolerance ${table.toleranceDegrees}°).`;
}
