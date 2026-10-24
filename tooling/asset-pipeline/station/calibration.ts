/**
 * Station calibration and drift refusal.
 *
 * A station is calibrated once against a physical reference and then checked at every shift. The
 * baseline is a solved metres-per-unit; a shift reading that differs by 2 % means the camera moved,
 * the lens was swapped, or the turntable height changed, and every model shot after that would carry
 * a size claim that is wrong. Drift is refused *before* a session starts, because 120 frames and a
 * photogrammetry pass are the expensive part, and a model whose scale is wrong is worse than none.
 *
 * Drift is kept in integer basis points (200 = 2 %) for the reason the migration gives: a float
 * ratio lets rounding decide whether a station at exactly the line passes.
 */

import { createHash } from 'node:crypto';
import { calibrationDrift, inputInvalid, stationProtocol } from '../errors.js';
import { canonicalJson } from './protocol.js';
import { solveMetricScale, REFERENCE_CARDS, CASE_WINDOW_MM, type ReferenceObservation } from '../metric-align.js';

/** 12 hours is a shift. The DDL enforces the same ceiling, and an "indefinite" calibration
 * turns a per-shift check into a one-off. */
export const MAX_VALIDITY_MINUTES = 720;
export const DEFAULT_VALIDITY_MINUTES = 480;
export const DRIFT_TOLERANCE_BASIS_POINTS = 200;

export interface CalibrationBaseline {
  readonly stationId: string;
  readonly referenceCardId: string;
  /** Solved at commissioning from at least two readings. */
  readonly metersPerUnit: number;
  readonly recordedAt: string;
  readonly observationCount: number;
}

export interface CalibrationRecord {
  readonly stationId: string;
  readonly referenceCardId: string;
  readonly measuredAt: string;
  readonly validUntil: string;
  readonly validityMinutes: number;
  readonly driftBasisPoints: number;
  readonly toleranceBasisPoints: number;
  readonly metersPerUnit: number;
  /** A 40.0 mm case as this station would publish it — the number an operator can picture. */
  readonly referenceCaseMm: number;
  readonly observationCount: number;
  readonly digest: string;
}

export function defineCalibrationBaseline(input: {
  stationId: string;
  referenceCardId: string;
  metersPerUnit: number;
  recordedAt: string;
  observationCount: number;
}): CalibrationBaseline {
  if (!(input.referenceCardId in REFERENCE_CARDS)) {
    throw inputInvalid(`"${input.referenceCardId}" is not a known reference card.`, `Use one of ${Object.keys(REFERENCE_CARDS).join(', ')}.`);
  }
  if (!Number.isFinite(input.metersPerUnit) || input.metersPerUnit <= 0) {
    throw inputInvalid(`Baseline scale is ${input.metersPerUnit} m/unit.`, 'A baseline is a solved positive scale, not a placeholder.');
  }
  if (!Number.isInteger(input.observationCount) || input.observationCount < 2) {
    throw inputInvalid(`Baseline was solved from ${input.observationCount} reading(s).`, 'Two readings are the minimum that can show stability.');
  }
  if (!Number.isFinite(Date.parse(input.recordedAt))) throw inputInvalid(`recordedAt ${input.recordedAt} is not an instant.`, 'Commissioning is a dated event.');
  return Object.freeze({ ...input, stationId: input.stationId.trim() });
}

export interface CalibrationCheckInput {
  readonly baseline: CalibrationBaseline;
  readonly readings: readonly ReferenceObservation[];
  /** The case span, so the record carries what a 40 mm case would look like at this scale. */
  readonly caseSpanUnits: number;
  readonly now: Date;
  readonly validityMinutes?: number;
  readonly toleranceBasisPoints?: number;
}

export interface CalibrationCheck {
  readonly record: CalibrationRecord;
  readonly driftRatio: number;
  readonly withinTolerance: boolean;
}

/**
 * Solve the shift readings, compare against the baseline, and refuse drift. The readings use the
 * same solver as the job itself, so the station's stability and the job's reference spread cannot
 * disagree about what "2 %" means.
 */
export function measureCalibration(input: CalibrationCheckInput): CalibrationCheck {
  const { baseline } = input;
  if (input.readings.length < 2) {
    throw inputInvalid('A shift calibration needs at least two readings.', 'One reading cannot show that the reference did not move.');
  }
  for (const reading of input.readings) {
    if (reading.cardId !== baseline.referenceCardId) {
      throw stationProtocol(
        'Calibration',
        `reading uses "${reading.cardId}" but the station is baselined against "${baseline.referenceCardId}"`,
        'Calibrate against the card the station was commissioned with; a different card is a different scale.',
      );
    }
  }
  const solved = solveMetricScale(input.readings);
  const driftRatio = Math.abs(solved.metersPerUnit - baseline.metersPerUnit) / baseline.metersPerUnit;
  const driftBasisPoints = Math.round(driftRatio * 10_000);
  const toleranceBasisPoints = input.toleranceBasisPoints ?? DRIFT_TOLERANCE_BASIS_POINTS;
  if (!Number.isInteger(toleranceBasisPoints) || toleranceBasisPoints <= 0) {
    throw inputInvalid(`Tolerance ${toleranceBasisPoints} basis points is not a positive integer.`, 'The tolerance is a whole number of basis points.');
  }
  const validityMinutes = input.validityMinutes ?? DEFAULT_VALIDITY_MINUTES;
  if (!Number.isInteger(validityMinutes) || validityMinutes <= 0 || validityMinutes > MAX_VALIDITY_MINUTES) {
    throw inputInvalid(`Validity ${validityMinutes} minutes is outside 1–${MAX_VALIDITY_MINUTES}.`, 'A calibration expires within a shift; that is what makes it a check rather than a ceremony.');
  }
  const referenceCaseMm = solved.metersPerUnit * input.caseSpanUnits * 1000;
  if (referenceCaseMm < CASE_WINDOW_MM.min || referenceCaseMm > CASE_WINDOW_MM.max) {
    throw inputInvalid(
      `The check card frames a case that solves to ${referenceCaseMm.toFixed(1)} mm.`,
      'Point the rig at a 24–50 mm reference object during calibration; a wildly scaled check is a lens or distance error.',
    );
  }

  const measuredAt = input.now.toISOString();
  const validUntil = new Date(input.now.getTime() + validityMinutes * 60_000).toISOString();
  const core = {
    stationId: baseline.stationId,
    referenceCardId: baseline.referenceCardId,
    measuredAt,
    validUntil,
    validityMinutes,
    driftBasisPoints,
    toleranceBasisPoints,
    metersPerUnit: solved.metersPerUnit,
    referenceCaseMm,
    observationCount: input.readings.length,
  };
  const record: CalibrationRecord = {
    ...core,
    digest: createHash('sha256').update(canonicalJson(core), 'utf8').digest('hex'),
  };
  const withinTolerance = driftBasisPoints < toleranceBasisPoints;
  if (!withinTolerance) {
    throw calibrationDrift(baseline.stationId, driftBasisPoints / 10_000, toleranceBasisPoints / 10_000, referenceCaseMm);
  }
  return { record, driftRatio: driftBasisPoints / 10_000, withinTolerance };
}

export interface CalibrationValidity {
  readonly valid: boolean;
  readonly reason: string;
  readonly minutesRemaining: number;
}

export function calibrationValidity(record: CalibrationRecord, now: Date): CalibrationValidity {
  const msRemaining = Date.parse(record.validUntil) - now.getTime();
  if (!Number.isFinite(msRemaining)) return { valid: false, reason: `validUntil "${record.validUntil}" is not an instant`, minutesRemaining: 0 };
  if (msRemaining <= 0) {
    return { valid: false, reason: `calibration expired at ${record.validUntil}`, minutesRemaining: 0 };
  }
  return { valid: true, reason: `valid until ${record.validUntil}`, minutesRemaining: Math.floor(msRemaining / 60_000) };
}

/** The gate in front of a capture session, so a stale calibration cannot be inherited by a job. */
export function assertCalibrationForCapture(record: CalibrationRecord, now: Date): void {
  const validity = calibrationValidity(record, now);
  if (!validity.valid) {
    throw stationProtocol(
      'Capture refused',
      validity.reason,
      'Re-run the shift calibration against the reference card, then open the session again. A stale calibration is the same risk as a drifted one.',
    );
  }
}

export function verifyCalibrationRecord(record: CalibrationRecord): boolean {
  const { digest, ...core } = record;
  return createHash('sha256').update(canonicalJson(core), 'utf8').digest('hex') === digest;
}
