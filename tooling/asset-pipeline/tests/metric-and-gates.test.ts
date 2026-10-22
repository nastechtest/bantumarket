import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CaptureError } from '../errors.js';
import { CASE_WINDOW_MM, alignCapture, alignmentStillInWindow, solveMetricScale } from '../metric-align.js';
import {
  DEFAULT_QC_THRESHOLDS,
  assertMeasurements,
  countFrames,
  describeGateResult,
  evaluateGates,
  refuseFromQc,
  runAutoQc,
  scopeSupportedByEvidence,
  type QcMeasurements,
} from '../auto-qc.js';

const passing: QcMeasurements = {
  frameCount: 48,
  sharpnessScore: 0.61,
  exposureMean: 0.52,
  highlightClipFraction: 0.004,
  holeCount: 0,
  nonManifoldCount: 1,
  textureBleedRatio: 0.002,
  silhouetteIou: 0.96,
};

const card = (measuredUnits: number, source = 'frame_001') => ({ cardId: 'credit_card', measuredUnits, source });

describe('metric alignment', () => {
  test('a credit card in frame solves a 40 mm case at the expected scale', () => {
    const result = alignCapture({ observations: [card(8.56, 'frame_010')], caseSpanUnits: 4 });
    expect(result.metersPerUnit).toBeCloseTo(0.01, 9);
    expect(result.caseDiameterMm).toBeCloseTo(40, 6);
    expect(result.withinWindow).toBe(true);
  });

  test('three readings of the same card agree, and the median is what carries the model', () => {
    const solution = solveMetricScale([card(8.56, 'a'), card(8.6, 'b'), card(8.52, 'c')]);
    expect(solution.observationCount).toBe(3);
    expect(solution.spreadRatio).toBeLessThan(0.02);
    expect(solution.metersPerUnit).toBeCloseTo(0.01, 6);
  });

  test('a 200 mm "watch" is refused, because a mis-scaled model is worse than no model', () => {
    let caught: unknown;
    try {
      alignCapture({ observations: [card(8.56)], caseSpanUnits: 20 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CaptureError);
    const error = caught as CaptureError;
    expect(error.code).toBe('metric_out_of_window');
    expect(error.exitCode).not.toBe(0);
    expect(error.message).toInclude('200.0 mm');
    expect(error.message).toInclude(`${CASE_WINDOW_MM.min.toFixed(1)} mm`);
  });

  test('a case below the window is refused too — the window is a range, not a floor', () => {
    expect(() => alignCapture({ observations: [card(8.56)], caseSpanUnits: 2 })).toThrow(CaptureError);
  });

  test('readings that disagree are refused instead of averaged', () => {
    let caught: unknown;
    try {
      solveMetricScale([card(8.56, 'frame_001'), card(8, 'frame_044')]);
    } catch (error) {
      caught = error;
    }
    expect((caught as CaptureError).code).toBe('metric_reference_unstable');
    expect((caught as CaptureError).message).toInclude('%');
  });

  test('an unknown reference is refused rather than assumed', () => {
    expect(() => solveMetricScale([{ cardId: 'tennis_ball', measuredUnits: 6.7, source: 'frame_002' }])).toThrow(CaptureError);
  });

  test('a zero or negative span is refused before it becomes a scale', () => {
    expect(() => alignCapture({ observations: [card(8.56)], caseSpanUnits: 0 })).toThrow(CaptureError);
    expect(() => solveMetricScale([card(-8.56)])).toThrow(CaptureError);
    expect(() => solveMetricScale([])).toThrow(CaptureError);
  });

  test('a re-checked alignment detects drift that happened after the first solve', () => {
    expect(alignmentStillInWindow(0.01, 4)).toBe(true);
    expect(alignmentStillInWindow(0.01, 20)).toBe(false);
    expect(alignmentStillInWindow(Number.NaN, 4)).toBe(false);
    expect(alignmentStillInWindow(0, 4)).toBe(false);
  });
});

describe('auto-QC gates', () => {
  test('a clean 48-frame session passes every gate and reports the numbers', () => {
    const report = runAutoQc(passing, { aligned: true, measuredAt: '2026-04-01T09:00:00.000Z' });
    expect(report.verdict).toBe('pass');
    expect(report.failing.length).toBe(0);
    expect(report.results.length).toBe(8);
    const coverage = report.results.find((r) => r.id === 'coverage')!;
    expect(coverage.measured).toBe(48);
    expect(coverage.threshold).toBe(40);
    expect(coverage.margin).toBe(8);
  });

  test('a 30-frame session fails on coverage and cannot support any claim', () => {
    const report = runAutoQc({ ...passing, frameCount: 30 }, { aligned: true, measuredAt: '2026-04-01T09:00:00.000Z' });
    expect(report.verdict).toBe('fail');
    const coverage = report.results.find((r) => r.id === 'coverage')!;
    expect(coverage.pass).toBe(false);
    expect(coverage.margin).toBe(-10);
    expect(report.scopeSupported).toBe('none');
  });

  test('the threshold is data: the same 30-frame session passes an explicitly loosened sheet', () => {
    const report = runAutoQc(
      { ...passing, frameCount: 30 },
      { aligned: true, measuredAt: '2026-04-01T09:00:00.000Z', thresholds: { ...DEFAULT_QC_THRESHOLDS, coverageFramesMin: 25 } },
    );
    expect(report.verdict).toBe('pass');
    expect(report.thresholds.coverageFramesMin).toBe(25);
  });

  test('a mesh hole strips the render’s right to evidence anything', () => {
    const report = runAutoQc({ ...passing, holeCount: 3 }, { aligned: true, measuredAt: '2026-04-01T09:00:00.000Z' });
    expect(report.verdict).toBe('fail');
    expect(report.scopeSupported).toBe('none');
    expect(report.results.find((r) => r.id === 'mesh_holes')!.gateClass).toBe('geometry_integrity');
  });

  test('a blurred bake still evidences shape, but only outer condition', () => {
    const report = runAutoQc({ ...passing, sharpnessScore: 0.11 }, { aligned: true, measuredAt: '2026-04-01T09:00:00.000Z' });
    expect(report.verdict).toBe('fail');
    expect(report.scopeSupported).toBe('condition_only');
  });

  test('white-blown highlights are a condition failure, not a geometry one', () => {
    const report = runAutoQc({ ...passing, highlightClipFraction: 0.09 }, { aligned: true, measuredAt: '2026-04-01T09:00:00.000Z' });
    expect(report.scopeSupported).toBe('condition_only');
  });

  test('a silhouette that disagrees with the poster is a different object', () => {
    const report = runAutoQc({ ...passing, silhouetteIou: 0.71 }, { aligned: true, measuredAt: '2026-04-01T09:00:00.000Z' });
    expect(report.scopeSupported).toBe('none');
  });

  test('no metric alignment means no geometry claim, however clean the mesh is', () => {
    const report = runAutoQc(passing, { aligned: false, measuredAt: '2026-04-01T09:00:00.000Z' });
    expect(report.verdict).toBe('pass');
    expect(report.scopeSupported).toBe('condition_only');
  });

  test('exposure is a range, and both ends fail it', () => {
    const dark = evaluateGates({ ...passing, exposureMean: 0.2 });
    const blown = evaluateGates({ ...passing, exposureMean: 0.93 });
    expect(dark.find((r) => r.id === 'exposure')!.pass).toBe(false);
    expect(blown.find((r) => r.id === 'exposure')!.pass).toBe(false);
    expect(dark.find((r) => r.id === 'exposure')!.margin).toBeCloseTo(-0.15, 6);
  });

  test('a blank or out-of-unit reading is refused, never read as a pass', () => {
    expect(() => assertMeasurements({ ...passing, sharpnessScore: Number.NaN })).toThrow(CaptureError);
    expect(() => assertMeasurements({ ...passing, silhouetteIou: 4.2 })).toThrow(CaptureError);
    expect(() => assertMeasurements({ ...passing, holeCount: -1 })).toThrow(CaptureError);
    expect(() => assertMeasurements({ ...passing, frameCount: 44.5 })).toThrow(CaptureError);
    expect(() => evaluateGates({ ...passing, textureBleedRatio: undefined as unknown as number })).toThrow(CaptureError);
  });

  test('refusal text carries the measurement and the requirement', () => {
    const report = runAutoQc({ ...passing, frameCount: 30 }, { aligned: true, measuredAt: '2026-04-01T09:00:00.000Z' });
    let caught: unknown;
    try {
      refuseFromQc(report);
    } catch (error) {
      caught = error;
    }
    const error = caught as CaptureError;
    expect(error.code).toBe('qc_gate_failed');
    expect(error.operatorSentence).toInclude('30 frames');
    expect(error.operatorSentence).toInclude('>= 40 frames');
    expect(error.hint).toInclude('re-shoot');
    expect(describeGateResult(report.results.find((r) => r.id === 'coverage')!)).toInclude('FAIL');
  });

  test('no combination of gate outcomes supports a wider claim than its evidence', () => {
    // Table-driven over single-gate sabotages: each one names the scope its class can still support,
    // so a future gate added to the wrong class shows up here as a widening nobody argued for.
    const cases: readonly { readonly sabotage: Partial<QcMeasurements>; readonly expected: string }[] = [
      { sabotage: {}, expected: 'geometry_and_external_condition' },
      { sabotage: { frameCount: 12 }, expected: 'none' },
      { sabotage: { holeCount: 7 }, expected: 'none' },
      { sabotage: { nonManifoldCount: 90 }, expected: 'none' },
      { sabotage: { silhouetteIou: 0.2 }, expected: 'none' },
      { sabotage: { sharpnessScore: 0.05 }, expected: 'condition_only' },
      { sabotage: { exposureMean: 0.99 }, expected: 'condition_only' },
      { sabotage: { highlightClipFraction: 0.4 }, expected: 'condition_only' },
      { sabotage: { textureBleedRatio: 0.5 }, expected: 'condition_only' },
    ];
    const widths: Record<string, number> = { none: 0, condition_only: 1, geometry_and_external_condition: 2 };
    for (const { sabotage, expected } of cases) {
      const aligned = runAutoQc({ ...passing, ...sabotage }, { aligned: true, measuredAt: '2026-04-01T09:00:00.000Z' });
      expect(aligned.scopeSupported).toBe(expected);
      // Unaligned capture can never reach the widest scope, whatever else passed.
      const unaligned = runAutoQc({ ...passing, ...sabotage }, { aligned: false, measuredAt: '2026-04-01T09:00:00.000Z' });
      expect(widths[unaligned.scopeSupported] ?? 0).toBeLessThanOrEqual(Math.min(widths[expected] ?? 0, 1));
    }
  });

  test('scopeSupportedByEvidence answers on the gate results alone', () => {
    const results = evaluateGates(passing);
    expect(scopeSupportedByEvidence(results, { withinWindow: true })).toBe('geometry_and_external_condition');
    expect(scopeSupportedByEvidence(results, null)).toBe('condition_only');
  });

  test('frame count comes off the disk, and non-frames do not count', () => {
    const dir = mkdtempSync(join(tmpdir(), 'frames-'));
    for (const name of ['f01.jpg', 'f02.jpeg', 'f03.png', 'f04.tif', 'notes.txt', 'manifest.json']) {
      writeFileSync(join(dir, name), 'x', 'utf8');
    }
    expect(countFrames(dir)).toBe(4);
    expect(() => countFrames(join(dir, 'does-not-exist'))).toThrow(CaptureError);
    const empty = mkdtempSync(join(tmpdir(), 'frames-empty-'));
    expect(() => countFrames(empty)).toThrow(CaptureError);
  });
});
