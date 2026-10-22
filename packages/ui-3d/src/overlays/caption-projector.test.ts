import { describe, expect, test } from 'bun:test';
import { pixelsPerUnitAtTarget, projectPoint } from './caption-projector.js';
import { FRONT_CAMERA, POLE_CAMERA, TAN_HALF_FOV, VIEWPORT_400 } from './overlay-fixtures.js';

describe('projectPoint', () => {
  test('target centre projects to the viewport centre at true depth', () => {
    const p = projectPoint([0, 0, 0], FRONT_CAMERA, VIEWPORT_400);
    expect(p.xPx).toBeCloseTo(200, 9);
    expect(p.yPx).toBeCloseTo(200, 9);
    expect(p.behind).toBe(false);
    expect(p.depthUnits).toBeCloseTo(0.5, 9);
  });

  test('a point one unit right of centre maps to the hand-derived px', () => {
    // xNdc = (0.1 / depth) / tan(fov/2) / aspect, so the expected value is arithmetic, not a snapshot.
    const expected = ((0.1 / 0.5 / TAN_HALF_FOV + 1) / 2) * 400;
    const p = projectPoint([0.1, 0, 0], FRONT_CAMERA, VIEWPORT_400);
    expect(p.xPx).toBeCloseTo(expected, 6);
    expect(p.xPx).toBeGreaterThan(200);
  });

  test('symmetric points mirror about the centre column', () => {
    const a = projectPoint([0.05, 0, 0], FRONT_CAMERA, VIEWPORT_400);
    const b = projectPoint([-0.05, 0, 0], FRONT_CAMERA, VIEWPORT_400);
    expect(a.xPx + b.xPx).toBeCloseTo(VIEWPORT_400.widthPx, 6);
  });

  test('a point on the frustum top edge maps to yPx 0, bottom edge to height', () => {
    const edgeY = TAN_HALF_FOV * 0.5;
    expect(projectPoint([0, edgeY, 0], FRONT_CAMERA, VIEWPORT_400).yPx).toBeCloseTo(0, 6);
    expect(projectPoint([0, -edgeY, 0], FRONT_CAMERA, VIEWPORT_400).yPx).toBeCloseTo(400, 6);
  });

  test('a point behind the eye is flagged, with px still finite', () => {
    const p = projectPoint([0, 0, 0.8], FRONT_CAMERA, VIEWPORT_400);
    expect(p.behind).toBe(true);
    expect(p.depthUnits).toBeLessThan(0);
    expect(Number.isFinite(p.xPx)).toBe(true);
    expect(Number.isFinite(p.yPx)).toBe(true);
  });

  test('a point inside the near plane is behind; just outside it is visible', () => {
    // Avoid float-equality traps: 0.005 and 0.02 are unambiguously under/over near = 0.01.
    expect(projectPoint([0, 0, 0.495], FRONT_CAMERA, VIEWPORT_400).behind).toBe(true); // depth 0.005
    expect(projectPoint([0, 0, 0.48], FRONT_CAMERA, VIEWPORT_400).behind).toBe(false); // depth 0.02
  });

  test('the north pole (camera on the up axis) stays finite instead of NaN', () => {
    const p = projectPoint([0.02, 0, 0], POLE_CAMERA, VIEWPORT_400);
    expect(p.behind).toBe(false);
    expect(Number.isFinite(p.xPx)).toBe(true);
    expect(Number.isFinite(p.yPx)).toBe(true);
    expect(p.xPx).toBeGreaterThanOrEqual(0);
    expect(p.xPx).toBeLessThanOrEqual(400);
    expect(p.yPx).toBeGreaterThanOrEqual(0);
    expect(p.yPx).toBeLessThanOrEqual(400);
  });

  test('the south pole is finite too, and off-axis points project off-canvas, not NaN', () => {
    const fromBelow = { ...POLE_CAMERA, position: [0, -0.5, 0] as const };
    const p = projectPoint([0, 0, 0.3], fromBelow, VIEWPORT_400);
    expect(p.behind).toBe(false);
    expect(Number.isFinite(p.xPx)).toBe(true);
    expect(Number.isFinite(p.yPx)).toBe(true);
  });
});

describe('pixelsPerUnitAtTarget', () => {
  test('equals half-height over target-depth times tan(half fov)', () => {
    expect(pixelsPerUnitAtTarget(FRONT_CAMERA, VIEWPORT_400)).toBeCloseTo(200 / (0.5 * TAN_HALF_FOV), 6);
  });

  test('a camera sitting on its target yields 0, never Infinity', () => {
    expect(pixelsPerUnitAtTarget({ ...FRONT_CAMERA, target: [0, 0, 0.5] }, VIEWPORT_400)).toBe(0);
  });

  test('scaling the viewport height scales px-per-unit linearly', () => {
    const doubled = pixelsPerUnitAtTarget(FRONT_CAMERA, { widthPx: 400, heightPx: 800 });
    expect(doubled / pixelsPerUnitAtTarget(FRONT_CAMERA, VIEWPORT_400)).toBeCloseTo(2, 9);
  });
});
