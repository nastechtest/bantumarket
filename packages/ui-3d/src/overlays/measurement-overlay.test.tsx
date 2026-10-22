import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MeasurementOverlay, formatMillimeters, measureMillimeters, type Caliper } from './measurement-overlay.js';
import { FRONT_CAMERA, VIEWPORT_400 } from './overlay-fixtures.js';

const LUG_TO_LUG: Caliper = { id: 'case-width', from: [0, 0, 0], to: [0.038, 0, 0] };

describe('measureMillimeters', () => {
  test('unit distance x metres-per-unit x 1000, from the metric alignment only', () => {
    expect(measureMillimeters(LUG_TO_LUG.from, LUG_TO_LUG.to, 1)).toBeCloseTo(38, 9);
    expect(measureMillimeters([0, 0, 0], [0.03, 0.04, 0], 1)).toBeCloseTo(50, 9);
    expect(measureMillimeters([0, 0, 0], [0.019, 0, 0], 2)).toBeCloseTo(38, 9);
  });

  test('no alignment, no number: null for every invalid scale', () => {
    for (const bad of [null, undefined, 0, -1, Number.NaN]) {
      expect(measureMillimeters(LUG_TO_LUG.from, LUG_TO_LUG.to, bad)).toBeNull();
    }
  });

  test('one decimal is the whole precision story (false precision is a CPA problem)', () => {
    expect(formatMillimeters(measureMillimeters([0, 0, 0], [1 / 30, 0, 0], 1)!)).toBe('33.3 mm');
    expect(formatMillimeters(38)).toBe('38.0 mm');
  });
});

describe('<MeasurementOverlay/>', () => {
  test('absent metric alignment means the overlay is ABSENT, not zeroed or guessed', () => {
    const html = renderToStaticMarkup(
      <MeasurementOverlay calipers={[LUG_TO_LUG]} metersPerUnit={null} camera={FRONT_CAMERA} viewport={VIEWPORT_400} />,
    );
    expect(html).toBe('');
  });

  test('a visible caliper draws its line and its mm label to one decimal', () => {
    const html = renderToStaticMarkup(
      <MeasurementOverlay calipers={[LUG_TO_LUG]} metersPerUnit={1} camera={FRONT_CAMERA} viewport={VIEWPORT_400} />,
    );
    expect(html).toContain('38.0 mm');
    expect(html).toContain('data-measurement-id="case-width"');
    expect(html).toContain('<line');
  });

  test('a caliper whose endpoints straddle behind the camera is dropped; the rest survive', () => {
    const behind: Caliper = { id: 'ghost', from: [0, 0, 0.8], to: [0.01, 0, 0.8] };
    const html = renderToStaticMarkup(
      <MeasurementOverlay calipers={[behind, LUG_TO_LUG]} metersPerUnit={1} camera={FRONT_CAMERA} viewport={VIEWPORT_400} />,
    );
    expect(html).not.toContain('ghost');
    expect(html).toContain('case-width');
  });

  test('a zero-length caliper is not drawn — 0.0 mm between one point and itself is noise', () => {
    const degenerate: Caliper = { id: 'flat', from: [0, 0, 0], to: [0, 0, 0] };
    const html = renderToStaticMarkup(
      <MeasurementOverlay calipers={[degenerate]} metersPerUnit={1} camera={FRONT_CAMERA} viewport={VIEWPORT_400} />,
    );
    expect(html).toBe('');
  });

  test('the overlay never intercepts orbit drags', () => {
    const html = renderToStaticMarkup(
      <MeasurementOverlay calipers={[LUG_TO_LUG]} metersPerUnit={1} camera={FRONT_CAMERA} viewport={VIEWPORT_400} />,
    );
    expect(html).toMatch(/pointer-events:none/);
  });
});
