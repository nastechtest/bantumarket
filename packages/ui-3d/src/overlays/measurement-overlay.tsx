import { raw } from '@nastech/design-tokens';
import { dist3, projectPoint, type CaptionCamera, type Vec3, type Viewport } from './caption-projector.js';
import { isValidMetersPerUnit } from './scale-bar.js';

/**
 * Optional calipers (brief 03, module 4).
 *
 * Measurements are derived from the capture's metric alignment, i.e. the two endpoints in unit
 * space multiplied by `metricScaleMetersPerUnit`. If the alignment is missing, the whole overlay
 * is ABSENT — not zeroed, not estimated from the model's bbox. A wrong measurement printed on a
 * listing is a consumer-protection problem (CPA §32, implied specification), and an invented
 * millimetre is indistinguishable from a real one once it is on screen.
 */

export interface Caliper {
  readonly id: string;
  /** Unit space, same frame as the captions. */
  readonly from: Vec3;
  readonly to: Vec3;
}

/** Null when the measurement cannot be stated honestly. */
export function measureMillimeters(from: Vec3, to: Vec3, metersPerUnit: number | null | undefined): number | null {
  if (!isValidMetersPerUnit(metersPerUnit)) return null;
  const mm = dist3(from, to) * metersPerUnit * 1000;
  return Number.isFinite(mm) ? mm : null;
}

/** One decimal, per the brief: the alignment does not support more, and showing more is a false precision claim. */
export function formatMillimeters(mm: number): string {
  return `${mm.toFixed(1)} mm`;
}

export interface MeasurementOverlayProps {
  readonly calipers: readonly Caliper[];
  readonly metersPerUnit: number | null | undefined;
  readonly camera: CaptionCamera;
  readonly viewport: Viewport;
}

export function MeasurementOverlay({ calipers, metersPerUnit, camera, viewport }: MeasurementOverlayProps) {
  if (!isValidMetersPerUnit(metersPerUnit)) return null;

  const segments = calipers
    .map((caliper) => ({
      caliper,
      a: projectPoint(caliper.from, camera, viewport),
      b: projectPoint(caliper.to, camera, viewport),
      mm: measureMillimeters(caliper.from, caliper.to, metersPerUnit),
    }))
    .filter((s) => !s.a.behind && !s.b.behind && s.mm !== null && dist3(s.caliper.from, s.caliper.to) > 0);

  if (segments.length === 0) return null;

  return (
    <svg
      className="nt-calipers"
      width={viewport.widthPx}
      height={viewport.heightPx}
      viewBox={`0 0 ${viewport.widthPx} ${viewport.heightPx}`}
      aria-label="Caliper measurements from the capture's metric alignment"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      {segments.map(({ caliper, a, b, mm }) => {
        if (mm === null) return null;
        const dx = b.xPx - a.xPx;
        const dy = b.yPx - a.yPx;
        const len = Math.hypot(dx, dy) || 1;
        const tick: [number, number] = [(-dy / len) * 6, (dx / len) * 6];
        const mid = { x: (a.xPx + b.xPx) / 2, y: (a.yPx + b.yPx) / 2 };
        const stroke = raw.color.ink500;
        return (
          <g key={caliper.id} data-measurement-id={caliper.id}>
            <line x1={a.xPx} y1={a.yPx} x2={b.xPx} y2={b.yPx} stroke={stroke} strokeWidth={1.5} strokeDasharray="5 3" />
            <line x1={a.xPx - tick[0]} y1={a.yPx - tick[1]} x2={a.xPx + tick[0]} y2={a.yPx + tick[1]} stroke={stroke} strokeWidth={1.5} />
            <line x1={b.xPx - tick[0]} y1={b.yPx - tick[1]} x2={b.xPx + tick[0]} y2={b.yPx + tick[1]} stroke={stroke} strokeWidth={1.5} />
            <text
              x={mid.x + tick[0] * 1.6}
              y={mid.y + tick[1] * 1.6}
              fontSize={11}
              fill={raw.color.ink800}
              style={{ fontFamily: raw.type.familyMono }}
            >
              {formatMillimeters(mm)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
