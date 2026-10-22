/**
 * Pure caption projection (brief 03, module 6).
 *
 * Unit-space position + camera + viewport → screen px, with a `behind` flag. Both the callouts
 * and the occlusion logic route through this one function so marker placement and occlusion
 * decisions can never disagree about where the camera is.
 *
 * Deliberately free of `three`: the overlay layer is DOM and must stay testable (and lazy-load
 * cheap) without dragging the scene runtime into the maths. The camera is described by the four
 * numbers the overlay actually needs, not by a camera object.
 */

export type Vec3 = readonly [number, number, number];

export interface CaptionCamera {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  /** Vertical field of view, degrees. */
  readonly fovDeg: number;
  readonly aspect: number;
  readonly near: number;
}

export interface Viewport {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface Projection {
  readonly xPx: number;
  readonly yPx: number;
  /** True when the point is not on screen in front of the near plane. */
  readonly behind: boolean;
  /** View-space distance from the eye, in unit space. Negative means behind the eye. */
  readonly depthUnits: number;
}

export function sub3(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function dist3(a: Vec3, b: Vec3): number {
  const d = sub3(a, b);
  return Math.hypot(d[0], d[1], d[2]);
}

export function normalize3(v: Vec3): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross3(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

interface ViewBasis {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly back: Vec3;
}

/**
 * Look-at basis (right-handed, camera looks along -back, matching three's convention). At the
 * poles — camera directly above/below the target with `up` parallel to the view axis — the cross
 * product degenerates and a naive implementation returns NaN px. The fallback picks the world
 * axis least aligned with the view axis, so poles stay finite; which way the pole "rolls" is
 * arbitrary, the px position is not.
 */
function viewBasis(camera: CaptionCamera): ViewBasis {
  const back = normalize3(sub3(camera.position, camera.target));
  let side = cross3(camera.up, back);
  if (Math.hypot(side[0], side[1], side[2]) < 1e-6) {
    const axes: readonly Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const leastAligned = axes.reduce((best, axis) => (Math.abs(dot3(axis, back)) < Math.abs(dot3(best, back)) ? axis : best), axes[0]!);
    side = cross3(leastAligned, back);
  }
  const right = normalize3(side);
  const up = normalize3(cross3(back, right));
  return { right, up, back };
}

export function projectPoint(point: Vec3, camera: CaptionCamera, viewport: Viewport): Projection {
  const { right, up, back } = viewBasis(camera);
  const v = sub3(point, camera.position);
  const xView = dot3(v, right);
  const yView = dot3(v, up);
  const depth = -dot3(v, back);
  const behind = !(depth > camera.near);
  // Clamped so a behind point still yields a finite px; `behind` says whether to trust it.
  const d = Math.max(depth, camera.near);
  const halfH = Math.tan((camera.fovDeg * Math.PI) / 180 / 2);
  const halfW = halfH * camera.aspect;
  const xNdc = halfW > 0 ? xView / d / halfW : 0;
  const yNdc = halfH > 0 ? yView / d / halfH : 0;
  return {
    xPx: ((xNdc + 1) / 2) * viewport.widthPx,
    yPx: ((1 - yNdc) / 2) * viewport.heightPx,
    behind,
    depthUnits: depth,
  };
}

/**
 * Screen px spanned by one unit of geometry at the camera's target depth. The scale bar and the
 * calipers both derive their px sizes from this so a change in framing moves the artefact and the
 * ruler together.
 */
export function pixelsPerUnitAtTarget(camera: CaptionCamera, viewport: Viewport): number {
  const distance = dist3(camera.position, camera.target);
  const halfH = Math.tan((camera.fovDeg * Math.PI) / 180 / 2);
  if (!(distance > 0) || !(halfH > 0)) return 0;
  return viewport.heightPx / 2 / (distance * halfH);
}
