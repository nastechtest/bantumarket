import { describe, expect, test } from 'bun:test';
import { facingAt, hullClearance, placeHotspot } from './annotation-hotspot.js';
import { CASE_BOUNDS, FRONT_CAMERA, VIEWPORT_400, makeCaption } from './overlay-fixtures.js';

describe('placeHotspot occlusion', () => {
  test('a hotspot on the camera side of the case is drawn', () => {
    const spot = placeHotspot(makeCaption('bezel-scratch', [0, 0, 0.02]), FRONT_CAMERA, VIEWPORT_400, CASE_BOUNDS);
    expect(spot.occluded).toBe(false);
    expect(spot.facing).toBeCloseTo(1, 6);
  });

  test('the far side of the case is hidden, not drawn through the metal', () => {
    const spot = placeHotspot(makeCaption('caseback-dent', [0, 0, -0.02]), FRONT_CAMERA, VIEWPORT_400, CASE_BOUNDS);
    expect(spot.occluded).toBe(true);
    expect(spot.facing).toBeCloseTo(-1, 6);
  });

  test('a grazing point past the terminator is hidden', () => {
    const spot = placeHotspot(makeCaption('lug-edge', [0.02, 0, 0]), FRONT_CAMERA, VIEWPORT_400, CASE_BOUNDS);
    expect(spot.occluded).toBe(true);
    expect(spot.facing).toBeLessThan(0);
  });

  test('a point behind the eye is occluded whatever its facing says', () => {
    const spot = placeHotspot(makeCaption('ghost', [0, 0, 0.8]), FRONT_CAMERA, VIEWPORT_400, CASE_BOUNDS);
    expect(spot.projection.behind).toBe(true);
    expect(spot.occluded).toBe(true);
  });

  test('a marker at the hull centre is treated as visible rather than hidden by unsure maths', () => {
    const spot = placeHotspot(makeCaption('dial-text', [0, 0, 0]), FRONT_CAMERA, VIEWPORT_400, CASE_BOUNDS);
    expect(spot.occluded).toBe(false);
    expect(facingAt([0, 0, 0], FRONT_CAMERA.position, CASE_BOUNDS)).toBe(1);
  });
});

describe('facing/geometry helpers', () => {
  test('facing degrades continuously as the eye moves off-axis', () => {
    const headOn = facingAt([0.02, 0, 0], [0.5, 0, 0], CASE_BOUNDS);
    expect(headOn).toBeCloseTo(1, 6); // eye straight along the normal at that point
    const angled = facingAt([0, 0, 0.02], [0.02, 0, 0.04], CASE_BOUNDS);
    expect(angled).toBeGreaterThan(0);
    expect(angled).toBeLessThan(1);
  });

  test('hullClearance reports the unit-space standoff of a caption from the hull', () => {
    expect(hullClearance([0, 0, 0.02], CASE_BOUNDS)).toBeCloseTo(0, 9);
    expect(hullClearance([0, 0, 0.05], CASE_BOUNDS)).toBeCloseTo(0.03, 9);
  });
});
