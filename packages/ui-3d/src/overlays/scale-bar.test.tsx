import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScaleBar, SCALE_BAR_METERS, isValidMetersPerUnit, scaleBarLengthPx } from './scale-bar.js';
import { pixelsPerUnitAtTarget } from './caption-projector.js';
import { FRONT_CAMERA, TAN_HALF_FOV, VIEWPORT_400 } from './overlay-fixtures.js';

describe('scaleBarLengthPx', () => {
  test('a 10 mm bar at metres-per-unit 1 is exactly the projected unit length', () => {
    const px = scaleBarLengthPx(1, FRONT_CAMERA, VIEWPORT_400);
    expect(px).toBeCloseTo(SCALE_BAR_METERS * pixelsPerUnitAtTarget(FRONT_CAMERA, VIEWPORT_400), 9);
    // Hand-computed: 0.01 units * 200px / (0.5 * tan 16°) ≈ 13.95 px at this framing.
    expect(px).toBeCloseTo(0.01 * (200 / (0.5 * TAN_HALF_FOV)), 4);
  });

  test('the bar length is a function of metres-per-unit: halving the bar-per-unit doubles the bar', () => {
    const at1 = scaleBarLengthPx(1, FRONT_CAMERA, VIEWPORT_400)!;
    const at2 = scaleBarLengthPx(2, FRONT_CAMERA, VIEWPORT_400)!;
    const at05 = scaleBarLengthPx(0.5, FRONT_CAMERA, VIEWPORT_400)!;
    expect(at2).toBeCloseTo(at1 / 2, 9);
    expect(at05).toBeCloseTo(at1 * 2, 9);
  });

  test('invalid or missing alignment yields null, never a guess', () => {
    for (const bad of [null, undefined, 0, -0.001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(scaleBarLengthPx(bad, FRONT_CAMERA, VIEWPORT_400)).toBeNull();
    }
    expect(isValidMetersPerUnit(0)).toBe(false);
    expect(isValidMetersPerUnit(1e-6)).toBe(true);
  });

  test('a degenerate camera (eye on target) yields null rather than an infinite bar', () => {
    expect(scaleBarLengthPx(1, { ...FRONT_CAMERA, target: [0, 0, 0.5] }, VIEWPORT_400)).toBeNull();
  });
});

describe('<ScaleBar/>', () => {
  test('renders the 10 mm label and the computed px width', () => {
    const html = renderToStaticMarkup(<ScaleBar metersPerUnit={1} camera={FRONT_CAMERA} viewport={VIEWPORT_400} />);
    expect(html).toContain('10 mm');
    expect(html).toContain('metric alignment');
    expect(html).toMatch(/width:1[3-4]\.\d+px/);
  });

  test('renders NOTHING when the alignment is missing — an honest absent ruler beats a lying one', () => {
    expect(renderToStaticMarkup(<ScaleBar metersPerUnit={null} camera={FRONT_CAMERA} viewport={VIEWPORT_400} />)).toBe('');
    expect(renderToStaticMarkup(<ScaleBar metersPerUnit={Number.NaN} camera={FRONT_CAMERA} viewport={VIEWPORT_400} />)).toBe('');
  });
});
