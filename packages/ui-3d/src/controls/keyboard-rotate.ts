import type { ConditionCaption } from '@nastech/api-contracts'
import {
  CAPTION_VIEW_CONE_DEG,
  CASE_BACK_POLAR_DEG,
  CRYSTAL_TOP_POLAR_DEG,
  azimuthDistance,
  captionVisibleFrom,
  clampAngles,
  enumerateAzimuthCells,
  enumeratePolarCells,
  geometryRecordsCaseBack,
  normalizeAzimuthDeg,
  polarLimits,
  validateGeometry,
  type AnglePair,
  type CaptureGeometry,
} from './constrained-orbit.js';

/**
 * Named poses and the keyboard path (07 §4.1 `controls/`).
 *
 * An arrow key that produces "azimuth 47.3°" is a transform, not something a person can hold in
 * their head, and it is worthless to a screen-reader user. So the keyboard moves on a grid — 15° of
 * yaw, 10° of pitch — and every cell of that grid is a *named* viewpoint of a watch ("dial face, 2
 * o'clock"). The grid exists only where the capture exists, because the cells are enumerated from
 * the clamp: there is no code path that names an unrecorded view.
 *
 * Alignment assumption, stated because the naming is only true if it holds: the capture's metric
 * alignment puts 12 o'clock at azimuth 0 and the crown at +90°. That is what `tooling/asset-pipeline`
 * records, and a model aligned some other way gets names that point at the wrong part of the dial.
 */

export const YAW_STEP_DEG = 15;
export const PITCH_STEP_DEG = 10;
/** `+` / `-` move one quarter of the way across the zoom range's per-stop unit. */
export const ZOOM_KEY_STEP = 0.25;
/** Dial band edges, in polar degrees, for the watch vocabulary. */
const DIAL_POLAR_DEG = 60;
const FLANK_POLAR_DEG = 100;
const HOUR_DEG = 30;

export interface CameraPose {
  readonly id: string;
  /** What the buyer is looking at. Orientation only — never a claim about the item. */
  readonly label: string;
  readonly azimuthDeg: number;
  readonly polarDeg: number;
  /** Hotspots legible from this pose, i.e. the condition content this view carries. */
  readonly hotspotIds: readonly string[];
  readonly captions: readonly ConditionCaption[];
  readonly row: number;
  readonly cell: number;
}

export interface PoseRow {
  readonly polarDeg: number;
  readonly poses: readonly CameraPose[];
}

export interface PoseCatalogue {
  readonly rows: readonly PoseRow[];
  readonly poses: readonly CameraPose[];
  readonly homeId: string;
  /**
   * The announced tour: the poses that carry condition content. When the capture has captions, the
   * keyboard walks this list and nothing else, so every key press either delivers disclosure text or
   * reports that the tour has reached the edge of what was photographed.
   */
  readonly tour: readonly CameraPose[];
  /** Captures with no hotspots at all. The keyboard still orbits; the announcer stays silent. */
  readonly captioned: boolean;
  readonly unreachableCaptions: readonly ConditionCaption[];
}

export interface BuildCatalogueOptions {
  readonly maxOffAxisDeg?: number;
  readonly yawStepDeg?: number;
  readonly pitchStepDeg?: number;
}

const signed = (v: number): string => `${v < 0 ? '-' : '+'}${String(Math.abs(Math.round(v))).padStart(3, '0')}`;

export function poseIdFor(angles: AnglePair): string {
  return `az${signed(normalizeAzimuthDeg(angles.azimuthDeg))}_pol${signed(angles.polarDeg)}`;
}

/** Snaps to the orbit grid, then clamps, so a snapped cell is always a recorded cell. */
export function snapAngles(geometry: CaptureGeometry, angles: AnglePair, step: { yaw: number; pitch: number }): AnglePair {
  const [polMin, polMax] = polarLimits(geometry);
  const az = normalizeAzimuthDeg(Math.round(angles.azimuthDeg / step.yaw) * step.yaw);
  const pol = Math.round(angles.polarDeg / step.pitch) * step.pitch;
  return clampAngles(geometry, { azimuthDeg: az, polarDeg: Math.min(Math.max(pol, polMin), polMax) });
}

const hourWord = (index: number): string => (index === 0 ? '12' : String(index));
const wrapHour = (index: number): number => ((index % 12) + 12) % 12;

/** Clock-position word for an azimuth. Half-hour cells read "between 1 and 2 o'clock". */
export function hourLabel(azimuthDeg: number): string {
  const quarters = azimuthDeg / HOUR_DEG;
  const nearest = Math.round(quarters);
  if (Math.abs(quarters - nearest) <= 0.25) return `${hourWord(wrapHour(nearest))} o'clock`;
  const low = wrapHour(Math.floor(quarters));
  const high = wrapHour(low + 1);
  return `between ${hourWord(low)} and ${hourWord(high)} o'clock`;
}

function crownFacing(azimuthDeg: number): boolean {
  return Math.abs(azimuthDistance(azimuthDeg, 90)) <= 7.5;
}

/** Dial-face band upper edge; past this the view is the flank rather than the dial. */
const DIAL_FACE_POLAR_DEG = 80;

export function describeView(angles: AnglePair, geometry: CaptureGeometry): string {
  const pol = angles.polarDeg;
  if (pol <= CRYSTAL_TOP_POLAR_DEG) return 'crystal, viewed from above';
  const hour = hourLabel(angles.azimuthDeg);
  if (pol < DIAL_POLAR_DEG) return `dial, ${hour}, seen from above`;
  if (pol <= DIAL_FACE_POLAR_DEG) return `dial face, ${hour}`;
  if (pol < FLANK_POLAR_DEG) return crownFacing(angles.azimuthDeg) ? "crown, 3 o'clock side" : `case flank, ${hour}`;
  if (pol < CASE_BACK_POLAR_DEG) return `case edge, ${hour}`;
  // Naming this "case back" when the pass never photographed it would be the exact lie the clamp
  // exists to prevent, so an unrecorded underside is named as what it is.
  return geometryRecordsCaseBack(geometry) ? `case back, ${hour}` : 'case underside';
}

/**
 * The watch's own vocabulary, generated over the recorded cells rather than hand-written per hotspot:
 * a buyer who rotates to a cell nobody annotated still gets a real name for what they are looking at.
 */
export function buildPoseCatalogue(
  geometry: CaptureGeometry,
  captions: readonly ConditionCaption[],
  options: BuildCatalogueOptions = {},
): PoseCatalogue {
  const g = validateGeometry(geometry);
  const yaw = options.yawStepDeg ?? YAW_STEP_DEG;
  const pitch = options.pitchStepDeg ?? PITCH_STEP_DEG;
  const cone = options.maxOffAxisDeg ?? CAPTION_VIEW_CONE_DEG;
  const azimuthCells = enumerateAzimuthCells(g, yaw);
  const polarCells = enumeratePolarCells(g, pitch);

  const rows: PoseRow[] = [];
  const poses: CameraPose[] = [];
  polarCells.forEach((polarDeg, row) => {
    const rowPoses: CameraPose[] = [];
    azimuthCells.forEach((azimuthDeg, cell) => {
      const angles: AnglePair = { azimuthDeg, polarDeg };
      const visible = captions.filter((c) => captionVisibleFrom(c, angles, cone));
      const pose: CameraPose = {
        id: poseIdFor(angles),
        label: describeView(angles, g),
        azimuthDeg,
        polarDeg,
        hotspotIds: visible.map((c) => c.hotspotId),
        captions: visible,
        row,
        cell,
      };
      rowPoses.push(pose);
      poses.push(pose);
    });
    rows.push({ polarDeg, poses: rowPoses });
  });

  const captioned = captions.length > 0;
  // Nearest-to-home row first: the dial ring is what a buyer came to look at, and a tour that starts
  // by walking to the crystal wastes the first three key presses.
  const homeAngles = clampAngles(g, { azimuthDeg: 0, polarDeg: 75 });
  const home = nearestPose({ rows, poses }, homeAngles);
  const ordered = [...poses].sort((a, b) => {
    const byRowDistance = Math.abs(a.polarDeg - home.polarDeg) - Math.abs(b.polarDeg - home.polarDeg);
    if (byRowDistance !== 0) return byRowDistance;
    return a.cell - b.cell;
  });
  const tour = captioned ? ordered.filter((p) => p.captions.length > 0) : ordered;
  const seenHotspots = new Set<string>();
  for (const p of poses) for (const id of p.hotspotIds) seenHotspots.add(id);
  const unreachableCaptions = captions.filter((c) => !seenHotspots.has(c.hotspotId));

  return { rows, poses, homeId: home.id, tour, captioned, unreachableCaptions };
}

/**
 * The legal named pose for an arbitrary angle. Grid angles resolve to their own cell; clamped
 * off-grid angles resolve to the closest one, with ties going to the earlier row then cell so the
 * answer is a function of the inputs alone.
 */
export function nearestPose(catalogue: Pick<PoseCatalogue, 'rows' | 'poses'>, angles: AnglePair): CameraPose {
  let best: CameraPose | undefined;
  let bestScore = Infinity;
  for (const p of catalogue.poses) {
    const score = Math.abs(azimuthDistance(angles.azimuthDeg, p.azimuthDeg)) + Math.abs(angles.polarDeg - p.polarDeg);
    if (!best || score < bestScore - 1e-9) {
      best = p;
      bestScore = score;
    }
  }
  return best ?? catalogue.poses[0]!;
}

/**
 * The canonical views of a watch, requested in the angle convention. Each one is clamped before it is
 * named, so a capture without a back pass simply does not produce a back stop: the button list can
 * only ever shrink, never invent a viewpoint.
 */
const CANONICAL_VIEWS: readonly AnglePair[] = [
  { azimuthDeg: 0, polarDeg: 75 },
  { azimuthDeg: 45, polarDeg: 75 },
  { azimuthDeg: 90, polarDeg: 85 },
  { azimuthDeg: 135, polarDeg: 85 },
  { azimuthDeg: -45, polarDeg: 75 },
  { azimuthDeg: -90, polarDeg: 85 },
  { azimuthDeg: 15, polarDeg: 20 },
  { azimuthDeg: 0, polarDeg: 150 },
];

/**
 * Buttons for a capture with no hotspots. The full grid would be forty-odd identical-looking buttons,
 * which is an instrument no buyer reads, so the uncaptioned surface is these named stops.
 */
export function canonicalStops(catalogue: PoseCatalogue, geometry: CaptureGeometry): readonly CameraPose[] {
  const out: CameraPose[] = [];
  const seen = new Set<string>();
  for (const requested of CANONICAL_VIEWS) {
    const pose = nearestPose(catalogue, clampAngles(geometry, requested));
    if (seen.has(pose.id)) continue;
    seen.add(pose.id);
    out.push(pose);
  }
  return out;
}

export type KeyboardStep = { readonly yawDeg: number; readonly pitchDeg: number };

/**
 * One keyboard press, resolved against the catalogue.
 *
 * When the capture carries captions the step lands on the next captioned cell in the requested
 * direction, skipping over cells that would announce nothing: silence after a key press reads as a
 * broken control, and an announcement without disclosure text is noise dressed as information.
 */
export function advancePose(
  catalogue: PoseCatalogue,
  current: CameraPose,
  step: KeyboardStep,
): { readonly pose: CameraPose; readonly blocked: boolean } {
  const from = current;
  const dRow = step.pitchDeg === 0 ? 0 : step.pitchDeg > 0 ? 1 : -1;
  const dCell = step.yawDeg === 0 ? 0 : step.yawDeg > 0 ? 1 : -1;
  if (dRow === 0 && dCell === 0) return { pose: from, blocked: false };

  let row = from.row;
  let cell = from.cell;
  for (let guard = 0; guard <= catalogue.poses.length; guard += 1) {
    row += dRow;
    cell += dCell;
    const candidateRow = catalogue.rows[row];
    if (!candidateRow) return { pose: from, blocked: true };
    const candidate = candidateRow.poses[cell];
    if (!candidate) {
      // Yaw is clamped at the band edges rather than wrapped, so running off the end of a row is the
      // capture limit: that part of the item was not photographed.
      return { pose: from, blocked: true };
    }
    if (!catalogue.captioned || candidate.captions.length > 0) return { pose: candidate, blocked: false };
  }
  return { pose: from, blocked: true };
}

export type CameraIntent =
  | { readonly kind: 'orbit'; readonly azimuthDeg: number; readonly polarDeg: number }
  | { readonly kind: 'orbit_step'; readonly yawDeg: number; readonly pitchDeg: number }
  | { readonly kind: 'zoom'; readonly zoom: number }
  | { readonly kind: 'zoom_step'; readonly delta: number }
  | { readonly kind: 'goto_pose'; readonly poseId: string }
  | { readonly kind: 'reset' };

export const KEY_HELP: readonly { readonly key: string; readonly says: string }[] = [
  { key: 'Left', says: 'orbit left, 15 degrees' },
  { key: 'Right', says: 'orbit right, 15 degrees' },
  { key: 'Up', says: 'tilt up, 10 degrees' },
  { key: 'Down', says: 'tilt down, 10 degrees' },
  { key: 'Plus', says: 'zoom in' },
  { key: 'Minus', says: 'zoom out' },
  { key: 'Home', says: 'reset the view' },
  { key: 'Escape', says: 'leave the viewer' },
];

/** The one key map. Unmapped keys return null so the page keeps its own scroll shortcuts. */
export function intentForKey(key: string): CameraIntent | null {
  switch (key) {
    case 'ArrowRight':
      return { kind: 'orbit_step', yawDeg: YAW_STEP_DEG, pitchDeg: 0 };
    case 'ArrowLeft':
      return { kind: 'orbit_step', yawDeg: -YAW_STEP_DEG, pitchDeg: 0 };
    case 'ArrowUp':
      // Tilting the camera toward the crystal is polar decreasing.
      return { kind: 'orbit_step', yawDeg: 0, pitchDeg: -PITCH_STEP_DEG };
    case 'ArrowDown':
      return { kind: 'orbit_step', yawDeg: 0, pitchDeg: PITCH_STEP_DEG };
    case '+':
    case '=':
      return { kind: 'zoom_step', delta: ZOOM_KEY_STEP };
    case '-':
    case '_':
      return { kind: 'zoom_step', delta: -ZOOM_KEY_STEP };
    case 'Home':
      return { kind: 'reset' };
    default:
      return null;
  }
}
