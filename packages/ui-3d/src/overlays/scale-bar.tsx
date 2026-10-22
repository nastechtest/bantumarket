import { raw, tokens } from '@nastech/design-tokens';
import { pixelsPerUnitAtTarget, type CaptionCamera, type Viewport } from './caption-projector.js';

/**
 * 10 mm scale bar (brief 03, module 3).
 *
 * The buyer must be able to tell a 38 mm case from a 42 mm one *from the artefact itself*, not
 * from the caption. So the bar is drawn through the same projection as the model: its px length
 * is `barMetres / metersPerUnit` worth of unit space at the target depth. Double
 * `metricScaleMetersPerUnit` — same model on screen? no: same unit-space model now means half
 * the physical size — and the bar halves against the geometry, which is the point.
 *
 * No alignment, no bar: see `measurement-overlay.tsx` for why guessing is a CPA problem.
 */

/** The reference length. 10 mm is the smallest interval that reads on a watch crown at phone size. */
export const SCALE_BAR_METERS = 0.01;

export function isValidMetersPerUnit(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Null when the bar cannot be drawn honestly; callers must hide it, never default it. */
export function scaleBarLengthPx(
  metersPerUnit: number | null | undefined,
  camera: CaptionCamera,
  viewport: Viewport,
  barMeters: number = SCALE_BAR_METERS,
): number | null {
  if (!isValidMetersPerUnit(metersPerUnit)) return null;
  const pxPerUnit = pixelsPerUnitAtTarget(camera, viewport);
  if (!(pxPerUnit > 0)) return null;
  const px = (barMeters / metersPerUnit) * pxPerUnit;
  return Number.isFinite(px) ? px : null;
}

export interface ScaleBarProps {
  readonly metersPerUnit: number | null | undefined;
  readonly camera: CaptionCamera;
  readonly viewport: Viewport;
}

export function ScaleBar({ metersPerUnit, camera, viewport }: ScaleBarProps) {
  const px = scaleBarLengthPx(metersPerUnit, camera, viewport);
  if (px === null) return null;
  const label = `${(SCALE_BAR_METERS * 1000).toFixed(0)} mm`;
  return (
    <div
      role="img"
      aria-label={`${label} scale bar — sized from this capture's metric alignment, not from the listing text`}
      className="nt-scale-bar"
      style={{ position: 'absolute', pointerEvents: 'none', font: `500 11px/1 ${raw.type.familyMono}`, color: tokens.text.primary }}
    >
      <span style={{ display: 'block', marginBottom: raw.space.s1 }}>{label}</span>
      <span
        aria-hidden
        style={{
          display: 'block',
          width: px,
          height: 0,
          borderTop: `2px solid ${raw.color.ink700}`,
          borderLeft: `2px solid ${raw.color.ink700}`,
          borderRight: `2px solid ${raw.color.ink700}`,
          boxSizing: 'border-box',
          minHeight: 6,
        }}
      />
    </div>
  );
}
