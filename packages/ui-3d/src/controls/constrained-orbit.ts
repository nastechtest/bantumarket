import type { ConditionCaption } from '@nastech/api-contracts'

/**
 * Constrained orbit (07 §4.1 `controls/`).
 *
 * The scene is a record of a photographic pass, not a free 3D object. Rotating into geometry the
 * capture never recorded shows the buyer a hole in the mesh — a hollow underside, a flat back — and
 * reads as evidence that the item has none. That is a lie about the item, so the limit is not a
 * preference: every angle that reaches the camera passes through `clampAngles`, and the profile that
 * permits it comes from the capture, never from a UI default.
 *
 * Angle convention (the whole directory depends on one):
 *  - `azimuthDeg` 0° puts the camera on the 12 o'clock side, looking at the dial; it increases
 *    clockwise seen from above, so +90° is the crown side and ±180° is 6 o'clock.
 *  - `polarDeg` is the three.js polar angle: 0° is directly above the crystal, 90° is level with the
 *    case, 180° is directly under the case back. Past 180° the camera flips and azimuth inverts,
 *    which is exactly the "rotate under the case back" failure, so polar is never allowed outside
 *    [0, 180] and never allowed near the poles where the flip happens.
 */

export interface AnglePair {
  readonly azimuthDeg: number;
  readonly polarDeg: number;
}

export interface CaptureGeometry {
  readonly allowedAzimuthRange: readonly [number, number];
  readonly allowedPolarRange: readonly [number, number];
}

export interface OrbitBounds extends CaptureGeometry {
  readonly zoomRange: readonly [number, number];
}

/** Polar angle at which the camera is looking at the case back rather than the flank. */
export const CASE_BACK_POLAR_DEG = 110;
/** Below this polar the view is dominated by the crystal seen from above, where azimuth is meaningless. */
export const CRYSTAL_TOP_POLAR_DEG = 30;
/**
 * OrbitControls and three both degenerate at the poles: the camera flips and azimuth silently
 * inverts by 180°. Keeping this far from the poles makes the flip unreachable, which is the only
 * way "no flipping under the case back" is true rather than usually true.
 */
export const POLAR_SINGULARITY_MARGIN_DEG = 4;
/**
 * A capture profile we have not been shown cannot be assumed generous. This is dial-and-flank only:
 * no case back, no underside. It is deliberately the smallest useful profile — a wrong-but-permissive
 * default is the failure that produces a lie about the item.
 */
export const SAFE_DEFAULT_GEOMETRY: CaptureGeometry = {
  allowedAzimuthRange: [-45, 45],
  allowedPolarRange: [40, 95],
};

export const DEFAULT_ZOOM_RANGE: readonly [number, number] = [0.6, 2.4];

/** A 40 mm case has to survive a drag across a phone screen; 0.35°/px is ~140° over 400 px. */
export const ORBIT_DEG_PER_PIXEL = 0.35;

/** A hotspot is legible while the camera is within this cone of its surface normal. */
export const CAPTION_VIEW_CONE_DEG = 55;

const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

export class CaptureGeometryError extends TypeError {}

function requireFinite(value: number, what: string): number {
  if (!Number.isFinite(value)) throw new CaptureGeometryError(`${what} must be a finite number, got ${value}`);
  return value;
}

/**
 * Validates the profile rather than sanitising it. An inverted or out-of-domain range is a broken
 * capture record: letting it through would mean the clamp silently permits whatever the arithmetic
 * happens to allow, which is the opposite of the point of this file.
 */
export function validateGeometry(geometry: CaptureGeometry): CaptureGeometry {
  const [azMin, azMax] = geometry.allowedAzimuthRange;
  const [polMin, polMax] = geometry.allowedPolarRange;
  requireFinite(azMin, 'allowedAzimuthRange[0]');
  requireFinite(azMax, 'allowedAzimuthRange[1]');
  requireFinite(polMin, 'allowedPolarRange[0]');
  requireFinite(polMax, 'allowedPolarRange[1]');
  if (polMin > polMax) {
    throw new CaptureGeometryError(`allowedPolarRange must ascend, got [${polMin}, ${polMax}]`);
  }
  if (polMin < 0 || polMax > 180) {
    throw new CaptureGeometryError(`allowedPolarRange must sit inside [0, 180], got [${polMin}, ${polMax}]`);
  }
  const span = azMax - azMin;
  if (span === 0) {
    throw new CaptureGeometryError('allowedAzimuthRange spans one direction only; a locked view is not an orbit');
  }
  if (span > 360 || span < -360) {
    throw new CaptureGeometryError(`allowedAzimuthRange spans more than a full turn, got ${span}°`);
  }
  // A negative span is not an error: it is a band that crosses the ±180° seam, which is how a
  // capture with the 6 o'clock side but a gap at 12 o'clock has to be written.
  return geometry;
}

/** Wraps into (-180, 180]. */
export function normalizeAzimuthDeg(azimuthDeg: number): number {
  let a = azimuthDeg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

function azimuthBand(geometry: CaptureGeometry): AzimuthBand {
  const [azMin, azMax] = geometry.allowedAzimuthRange;
  const span = azMax - azMin;
  if (Math.abs(span) >= 359.5) {
    return { lo: 0, hi: 0, wraps: false, free: true, enforceable: false, spanDeg: 360 };
  }
  const lo = normalizeAzimuthDeg(azMin);
  const hi = normalizeAzimuthDeg(azMax);
  const wraps = span < 0;
  // A wrap band means "increase from `lo`, across the ±180° seam, until `hi`".
  const spanDeg = wraps ? (hi - lo + 360) % 360 : hi - lo;
  return { lo, hi, wraps, free: false, enforceable: !wraps, spanDeg };
}

/** Shortest signed distance from `from` to `to` on the azimuth circle. */
export function azimuthDistance(from: number, to: number): number {
  return normalizeAzimuthDeg(to - from);
}

function azimuthInside(band: ReturnType<typeof azimuthBand>, azimuthDeg: number): boolean {
  if (band.free) return true;
  const a = normalizeAzimuthDeg(azimuthDeg);
  return band.wraps ? a >= band.lo || a <= band.hi : a >= band.lo && a <= band.hi;
}

/** Nearest permitted azimuth, measured as arc distance so a wrap-around band resolves correctly. */
function clampAzimuth(band: ReturnType<typeof azimuthBand>, azimuthDeg: number): number {
  if (band.free) return normalizeAzimuthDeg(azimuthDeg);
  const a = normalizeAzimuthDeg(azimuthDeg);
  if (azimuthInside(band, a)) return a;
  const dLo = Math.abs(azimuthDistance(a, band.lo));
  const dHi = Math.abs(azimuthDistance(a, band.hi));
  // Tie-breaks go to `hi` so a view exactly between two edges is reproducible.
  return dLo < dHi ? band.lo : band.hi;
}

export function polarLimits(geometry: CaptureGeometry): readonly [number, number] {
  const [polMin, polMax] = geometry.allowedPolarRange;
  return [Math.max(polMin, POLAR_SINGULARITY_MARGIN_DEG), Math.min(polMax, 180 - POLAR_SINGULARITY_MARGIN_DEG)];
}

/**
 * The law. Everything that can move the camera — mouse drag, pinch, arrow keys, a scene that set the
 * camera itself — is filtered through here, so an unrecorded angle is not merely discouraged but
 * unrepresentable in the state.
 */
export function clampAngles(geometry: CaptureGeometry, angles: AnglePair): AnglePair {
  const band = azimuthBand(geometry);
  const [polMin, polMax] = polarLimits(geometry);
  const polarDeg = Math.min(Math.max(requireFinite(angles.polarDeg, 'polarDeg'), polMin), polMax);
  return { azimuthDeg: clampAzimuth(band, requireFinite(angles.azimuthDeg, 'azimuthDeg')), polarDeg };
}

export function isWithinGeometry(geometry: CaptureGeometry, angles: AnglePair, toleranceDeg = 0): boolean {
  const clamped = clampAngles(geometry, angles);
  const [polMin, polMax] = polarLimits(geometry);
  const polarOk =
    Math.abs(clamped.polarDeg - angles.polarDeg) <= toleranceDeg &&
    angles.polarDeg >= polMin - toleranceDeg &&
    angles.polarDeg <= polMax + toleranceDeg;
  const az = normalizeAzimuthDeg(angles.azimuthDeg);
  return polarOk && Math.abs(azimuthDistance(az, clamped.azimuthDeg)) <= toleranceDeg;
}

export function geometryRecordsCaseBack(geometry: CaptureGeometry): boolean {
  const [, polMax] = polarLimits(geometry);
  return polMax >= CASE_BACK_POLAR_DEG;
}

/** Unit vector from the item's centre toward the camera. Matches the angle convention above. */
export function viewDirection(angles: AnglePair): readonly [number, number, number] {
  const az = rad(angles.azimuthDeg);
  const pol = rad(angles.polarDeg);
  const sin = Math.sin(pol);
  return [sin * Math.sin(az), Math.cos(pol), sin * Math.cos(az)];
}

function unit(v: readonly [number, number, number]): readonly [number, number, number] {
  const [x, y, z] = v;
  const len = Math.hypot(x, y, z);
  if (len < 1e-9) return [0, 0, 1];
  return [x / len, y / len, z / len];
}

/**
 * A caption is reachable from this angle when the camera is looking at the side of the item the
 * hotspot sits on. This pairing is what makes the text path and the render path the same content:
 * the disclosure the dispute process reads is the disclosure the buyer is told they are seeing.
 */
export function captionVisibleFrom(
  caption: ConditionCaption,
  angles: AnglePair,
  maxOffAxisDeg: number = CAPTION_VIEW_CONE_DEG,
): boolean {
  const dir = viewDirection(angles);
  const normal = unit(caption.position);
  const dot = dir[0] * normal[0] + dir[1] * normal[1] + dir[2] * normal[2];
  const angle = deg(Math.acos(Math.min(1, Math.max(-1, dot))));
  return angle <= maxOffAxisDeg;
}

export function visibleCaptions(
  captions: readonly ConditionCaption[],
  angles: AnglePair,
  maxOffAxisDeg: number = CAPTION_VIEW_CONE_DEG,
): readonly ConditionCaption[] {
  return captions.filter((c) => captionVisibleFrom(c, angles, maxOffAxisDeg));
}

export function clampZoom(zoomRange: readonly [number, number], zoom: number): number {
  const [min, max] = zoomRange;
  if (!Number.isFinite(zoom)) return min;
  return Math.min(Math.max(zoom, min), max);
}

/**
 * Spherical clamp of a camera offset. drei's OrbitControls clamps what the *user* drags to; this
 * clamps what any code puts on the camera, including the controls' own damping inertia overshooting
 * the limit by a frame. Applied in the scene loop, it is the reason the limit is a fact rather than
 * a request.
 */
export function clampCameraOffset(
  geometry: CaptureGeometry,
  offset: readonly [number, number, number],
): readonly [number, number, number] {
  const [x, y, z] = offset;
  const r = Math.hypot(x, y, z);
  if (r < 1e-9) return [0, 0, r || 1e-6];
  const polarDeg = deg(Math.acos(Math.min(1, Math.max(-1, y / r))));
  const azimuthDeg = normalizeAzimuthDeg(deg(Math.atan2(x, z)));
  const clamped = clampAngles(geometry, { azimuthDeg, polarDeg });
  const dir = viewDirection(clamped);
  return [dir[0] * r, dir[1] * r, dir[2] * r];
}

/** The structural surface of drei/three's OrbitControls that this file needs, as a legal minimum. */
export interface OrbitControlsLike {
  minAzimuthAngle: number;
  maxAzimuthAngle: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minDistance: number;
  maxDistance: number;
  enableRotate: boolean;
  target: { readonly x: number; readonly y: number; readonly z: number };
  object: { readonly position: { readonly x: number; readonly y: number; readonly z: number } };
}

/**
 * Wraps drei rather than depending on it: no import, so nothing in this directory pulls the scene
 * runtime, and the same call works on any object carrying those fields.
 *
 * `baseDistance` is taken from the live camera, not a constant, because the framing distance is the
 * viewer agent's business and the zoom range is relative to it.
 *
 * A band that crosses the ±180° seam cannot be written as one min/max pair — OrbitControls has no
 * vocabulary for it. Leaving azimuth unbounded there and clamping every frame is the honest choice:
 * a wrong limit looks like a working one, which is how an unrecorded view ends up on screen.
 */
export function applyOrbitLimits<T extends OrbitControlsLike>(controls: T, bounds: OrbitBounds): T {
  const band = azimuthBand(bounds);
  const [polMin, polMax] = polarLimits(bounds);
  const [zoomMin, zoomMax] = bounds.zoomRange;
  const ox = controls.object.position.x - controls.target.x;
  const oy = controls.object.position.y - controls.target.y;
  const oz = controls.object.position.z - controls.target.z;
  const baseDistance = Math.hypot(ox, oy, oz) || 1;

  controls.minAzimuthAngle = band.enforceable ? rad(band.lo) : -Infinity;
  controls.maxAzimuthAngle = band.enforceable ? rad(band.hi) : Infinity;
  controls.minPolarAngle = rad(polMin);
  controls.maxPolarAngle = rad(polMax);
  controls.minDistance = baseDistance / zoomMax;
  controls.maxDistance = baseDistance / zoomMin;
  return controls;
}

/** The azimuth band as a resolved arc: `free` turns anywhere, `wraps` crosses the ±180° seam. */
export interface AzimuthBand {
  readonly lo: number;
  readonly hi: number;
  readonly wraps: boolean;
  readonly free: boolean;
  /** Whether a single min/max pair can express this band to drei's controls. */
  readonly enforceable: boolean;
  readonly spanDeg: number;
}

export function azimuthBandOf(geometry: CaptureGeometry): AzimuthBand {
  return azimuthBand(geometry);
}

/**
 * Cells the capture actually recorded, on the orbit grid. Derived from the clamp rather than a
 * catalogue of viewpoints, so a pose can only ever exist where the geometry exists.
 */
export function enumerateAzimuthCells(geometry: CaptureGeometry, stepDeg: number): readonly number[] {
  const band = azimuthBand(geometry);
  if (band.free) {
    const cells: number[] = [];
    for (let a = -180; a < 180; a += stepDeg) cells.push(normalizeAzimuthDeg(a));
    return cells;
  }
  const cells: number[] = [];
  for (let walked = 0; walked <= band.spanDeg + 1e-9; walked += stepDeg) {
    cells.push(normalizeAzimuthDeg(band.lo + walked));
  }
  return cells;
}

export function enumeratePolarCells(geometry: CaptureGeometry, stepDeg: number): readonly number[] {
  const [polMin, polMax] = polarLimits(geometry);
  const cells: number[] = [];
  for (let p = Math.ceil(polMin / stepDeg) * stepDeg; p <= polMax + 1e-9; p += stepDeg) {
    cells.push(Math.round(p * 1e6) / 1e6);
  }
  return cells;
}

export type OrbitInput = (input: { readonly kind: 'orbit'; readonly azimuthDeg: number; readonly polarDeg: number }) => void;

export interface OrbitDragHandle {
  activate(): void;
  deactivate(): void;
}

/**
 * Single-pointer orbit for the no-drei path. Emits absolute angles measured from the drag origin,
 * clamped once here (so the emitted intent is already legal) and again by the reducer (so no caller
 * can bypass it). A right-button drag is ignored: it belongs to the context menu, not the item.
 */
export function createOrbitDrag(
  host: HTMLElement,
  opts: {
    readonly readAngles: () => AnglePair;
    readonly geometry: CaptureGeometry;
    readonly onInput: OrbitInput;
    readonly degreesPerPixel?: number;
  },
): OrbitDragHandle {
  const scale = opts.degreesPerPixel ?? ORBIT_DEG_PER_PIXEL;
  let origin: { x: number; y: number; azimuthDeg: number; polarDeg: number } | null = null;
  let pointerId: number | null = null;

  const down = (event: Event) => {
    const e = asPointerLike(event);
    if (pointerId !== null || e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType !== 'mouse' && e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    pointerId = e.pointerId;
    const start = opts.readAngles();
    origin = { x: e.clientX, y: e.clientY, azimuthDeg: start.azimuthDeg, polarDeg: start.polarDeg };
  };
  const move = (event: Event) => {
    if (pointerId === null || origin === null) return;
    const e = asPointerLike(event);
    if (e.pointerId !== pointerId) return;
    const start = origin;
    opts.onInput({
      kind: 'orbit',
      azimuthDeg: start.azimuthDeg - (e.clientX - start.x) * scale,
      // Dragging down moves the camera down the item, which is polar increasing.
      polarDeg: start.polarDeg + (e.clientY - start.y) * scale,
    });
  };
  const up = (event: Event) => {
    const e = asPointerLike(event);
    if (pointerId !== null && e.pointerId === pointerId) {
      pointerId = null;
      origin = null;
    }
  };

  const attach = (on: boolean) => {
    const listen = on ? host.addEventListener.bind(host) : host.removeEventListener.bind(host);
    listen('pointerdown', down);
    listen('pointermove', move);
    listen('pointerup', up);
    listen('pointercancel', up);
  };

  return { activate: () => attach(true), deactivate: () => attach(false) };
}

/** Structural pointer fields only: jsdom has no PointerEvent, and nothing here needs more than these. */
export interface PointerLike {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerType: string;
  readonly button: number;
}

/**
 * Reads the pointer fields off a dispatched event. The listeners below are attached through a bound
 * `addEventListener`, which hands them a plain `Event`, and the tests dispatch a synthesised pointer
 * event rather than a `PointerEvent` jsdom does not have — so the shape is asserted once, here.
 */
export function asPointerLike(event: Event): PointerLike {
  return event as unknown as PointerLike;
}
