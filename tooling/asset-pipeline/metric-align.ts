/**
 * Metric alignment.
 *
 * The scene runtime works in unit space; the manifest carries `metricScaleMetersPerUnit` so a buyer
 * can be told "40.5 mm case" and a dispute can measure the claim. That number is solved from a
 * physical reference in frame — a credit card (ISO/IEC 7810 ID-1, 85.60 mm wide) or a printed scale
 * card — not guessed.
 *
 * Two refusals, both louder than publishing:
 *
 * - the solved case size must land inside the pilot window (24 mm – 50 mm). A watch that solves to
 *   200 mm means the reference was measured wrong, and a mis-scaled model is worse than no model
 *   because the size claim rides on it and the buyer cannot see the error.
 * - repeated observations of the same reference must agree within tolerance. One bad reading is the
 *   common failure here: the card moves, is occluded, or is not the card it claims to be.
 */

import { metricOutOfWindow, metricReferenceUnstable, inputInvalid } from './errors.js';

export interface ReferenceCard {
  readonly id: string;
  readonly label: string;
  /** True physical width of the reference, in metres. */
  readonly trueWidthMeters: number;
}

/** Real, checkable objects. Widths are the published standards, not tuned numbers. */
export const REFERENCE_CARDS: Readonly<Record<string, ReferenceCard>> = {
  credit_card: { id: 'credit_card', label: 'Bank card, ISO/IEC 7810 ID-1 width', trueWidthMeters: 0.0856 },
  id_card: { id: 'id_card', label: 'Smart ID card, ISO/IEC 7810 ID-1 width', trueWidthMeters: 0.0856 },
  scale_card_50mm: { id: 'scale_card_50mm', label: 'Printed scale card, 50 mm bar', trueWidthMeters: 0.05 },
  scale_card_100mm: { id: 'scale_card_100mm', label: 'Printed scale card, 100 mm bar', trueWidthMeters: 0.1 },
} as const;

/** Pre-owned watch cases. Outside this, it is not the pilot category or the reference is wrong. */
export const CASE_WINDOW_MM: Readonly<{ min: number; max: number }> = { min: 24, max: 50 } as const;

/** 2 % across frames is roughly where a card that slid in frame starts to show up. */
export const REFERENCE_SPREAD_TOLERANCE = 0.02;

export interface ReferenceObservation {
  readonly cardId: string;
  /** How wide the reference measures in the reconstructed model's unit space. */
  readonly measuredUnits: number;
  /** Frame or image the reading came from, so a refusal names where to look. */
  readonly source: string;
}

export interface MetricSolution {
  readonly metersPerUnit: number;
  readonly spreadRatio: number;
  readonly observationCount: number;
  readonly perObservation: readonly { source: string; cardId: string; metersPerUnit: number }[];
}

export interface AlignmentResult {
  readonly metersPerUnit: number;
  /** The solved case diameter, so a refusal can show the number it refused. */
  readonly caseDiameterMm: number;
  readonly spreadRatio: number;
  readonly withinWindow: true;
}

export function referenceCard(cardId: string): ReferenceCard {
  const card = REFERENCE_CARDS[cardId];
  if (!card) {
    throw inputInvalid(
      `"${cardId}" is not a known physical reference (${Object.keys(REFERENCE_CARDS).join(', ')}).`,
      'Record the reference you actually placed in frame; an invented reference produces an invented scale.',
    );
  }
  return card;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Solve scale from observations, taking the median so one outlier cannot carry the model. Refuses
 * when the readings disagree: averaging a set of contradictory measurements would produce a number
 * that looks as trustworthy as the good ones.
 */
export function solveMetricScale(observations: readonly ReferenceObservation[]): MetricSolution {
  if (observations.length === 0) {
    throw inputInvalid('No reference observations were recorded.', 'Put a card in frame and record its width in unit space before processing.');
  }
  const perObservation = observations.map((o) => {
    if (!(o.measuredUnits > 0) || !Number.isFinite(o.measuredUnits)) {
      throw inputInvalid(`Reference reading from "${o.source}" measures ${o.measuredUnits} units.`, 'The reference must span a positive, finite distance in frame.');
    }
    return { source: o.source, cardId: o.cardId, metersPerUnit: referenceCard(o.cardId).trueWidthMeters / o.measuredUnits };
  });
  const scales = perObservation.map((p) => p.metersPerUnit);
  const solved = median(scales);
  const spreadRatio = (Math.max(...scales) - Math.min(...scales)) / solved;
  if (spreadRatio > REFERENCE_SPREAD_TOLERANCE) throw metricReferenceUnstable(spreadRatio, REFERENCE_SPREAD_TOLERANCE);
  return { metersPerUnit: solved, spreadRatio, observationCount: observations.length, perObservation: Object.freeze(perObservation) };
}

export interface AlignInput {
  readonly observations: readonly ReferenceObservation[];
  /** The watch case diameter as measured in the same unit space as the observations. */
  readonly caseSpanUnits: number;
}

export function alignCapture(input: AlignInput): AlignmentResult {
  if (!(input.caseSpanUnits > 0) || !Number.isFinite(input.caseSpanUnits)) {
    throw inputInvalid(`The case spans ${input.caseSpanUnits} units.`, 'Measure the case across the lugs in the reconstruction before aligning.');
  }
  const solution = solveMetricScale(input.observations);
  const caseDiameterMm = solution.metersPerUnit * input.caseSpanUnits * 1000;
  if (caseDiameterMm < CASE_WINDOW_MM.min || caseDiameterMm > CASE_WINDOW_MM.max) {
    throw metricOutOfWindow(caseDiameterMm / 1000, CASE_WINDOW_MM.min, CASE_WINDOW_MM.max);
  }
  return {
    metersPerUnit: solution.metersPerUnit,
    caseDiameterMm,
    spreadRatio: solution.spreadRatio,
    withinWindow: true,
  };
}

export function describeAlignment(result: AlignmentResult): string {
  return `Metric scale ${result.metersPerUnit.toExponential(4)} m/unit; case solves to ${result.caseDiameterMm.toFixed(1)} mm (window ${CASE_WINDOW_MM.min}–${CASE_WINDOW_MM.max} mm); reference spread ${(result.spreadRatio * 100).toFixed(2)} %.`;
}

/**
 * Re-check an alignment that is already recorded. QC reads this instead of trusting the stored
 * number: the window is the invariant, so a scale that drifted through a re-shoot fails here rather
 * than at the buyer's wrist.
 */
export function alignmentStillInWindow(metersPerUnit: number, caseSpanUnits: number): boolean {
  if (!Number.isFinite(metersPerUnit) || metersPerUnit <= 0) return false;
  const caseDiameterMm = metersPerUnit * caseSpanUnits * 1000;
  return caseDiameterMm >= CASE_WINDOW_MM.min && caseDiameterMm <= CASE_WINDOW_MM.max;
}
