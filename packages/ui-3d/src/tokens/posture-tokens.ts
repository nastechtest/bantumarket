/**
 * Camera poses (07 §4.1 `tokens/`) — the named views `controls/` announces.
 *
 * Plain data, and it stays plain: `controls/` and `viewer/` are separate directories and this module
 * imports neither, so the pose list is reachable from a page with no canvas on it.
 *
 * `label` is the accessibility surface, not a comment. It is the text a screen reader speaks when the
 * buyer tabs to the pose button, which means it has to stand alone: the hour is spelled out because it
 * is read aloud, the noun comes first because a button list is scanned by its first word, and no label
 * claims anything the render cannot evidence — a pose says *where you are looking*, never what was
 * checked.
 *
 * Angles are degrees in the object's own frame, measured with the dial facing +Y:
 *  - `azimuth` rotates around +Y; 0 is the 12 o'clock side, +90 is 3 o'clock, seen from above.
 *  - `polar` is measured down from +Y: 0 is directly over the dial, 90 is level with the case band,
 *    180 is looking up at the case back. So the dial poses have a small polar and the back a large one.
 *  - `zoom` is a multiplier on the default framing distance, where 1 is the `sceneTokens.frameFill`
 *    framing. Larger means closer.
 */

export interface CameraPose {
  readonly id: string;
  readonly label: string;
  readonly azimuth: number;
  readonly polar: number;
  readonly zoom: number;
}

/** Guards for the pose table; a pose outside these is a data error, not a stylistic choice. */
export const POSE_LIMITS = {
  azimuthMin: 0,
  azimuthMax: 360,
  polarMin: 0,
  polarMax: 180,
  zoomMin: 1,
  zoomMax: 2.5,
} as const;

export const cameraPoses: readonly CameraPose[] = [
  { id: 'dial-face', label: 'Watch dial, seen from the front', azimuth: 0, polar: 18, zoom: 1 },
  { id: 'three-oclock', label: "Three o'clock side of the case", azimuth: 90, polar: 78, zoom: 1.25 },
  { id: 'six-oclock', label: "Six o'clock side of the case", azimuth: 180, polar: 78, zoom: 1.25 },
  { id: 'case-back', label: 'Case back', azimuth: 0, polar: 164, zoom: 1.15 },
  { id: 'clasp', label: 'Bracelet clasp', azimuth: 270, polar: 96, zoom: 1.5 },
  { id: 'crown', label: 'Winding crown', azimuth: 90, polar: 90, zoom: 1.9 },
] as const;

export const POSTURE_IDS: readonly string[] = cameraPoses.map((p) => p.id);

export function postureById(id: string): CameraPose | undefined {
  return cameraPoses.find((p) => p.id === id);
}

/** The order the controls list them: inspection reads as a circuit of the object, so the dial first
 *  and the small parts last rather than by angle. */
export function poseOrder(): readonly string[] {
  return POSTURE_IDS;
}
