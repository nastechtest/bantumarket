import { sceneTokens } from '@nastech/ui-3d/tokens';

/**
 * The shared structural types the inspect surface passes to `@nastech/ui-3d/overlays`.
 *
 * These mirror the overlay package's own (private) types by *shape*, not by import: the overlays
 * subpath is not yet re-exported from the package (CONTRACT-GAP — see the report and
 * `ui3d-overlays.d.ts`), and TypeScript is structural, so a plain object with these fields is
 * accepted by the real `OverlayRoot` the moment the export lands. Keeping them here means the DOM
 * overlay wiring is testable with no dependency on an unresolvable specifier.
 */

export type Vec3 = readonly [number, number, number];

/** The four numbers an overlay actually needs to project a caption — a camera described by data. */
export interface CaptionCamera {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly fovDeg: number;
  readonly aspect: number;
  readonly near: number;
}

export interface Viewport {
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Unit-space bounding sphere for the convex-facing occlusion test. */
export interface ConvexBounds {
  readonly center: Vec3;
  readonly radiusUnits: number;
}

/**
 * One caliper between two unit-space points. `from`/`to` are the package's field names, not ours:
 * this is a shape mirror of `@nastech/ui-3d/overlays/measurement-overlay`'s Caliper, so mirroring a
 * different name is what makes the overlay reject a real caliper the day the subpath is exported.
 * `label` is the app's own — it names *what* is measured; the millimetre figure is the overlay's to
 * compute from the metric alignment, which is why there is no `millimetres` field here.
 */
export interface Caliper {
  readonly id: string;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly label: string;
}

/**
 * A camera intent expressed as orbit angles, the currency `share-pose` and the keyboard both speak.
 * `azimuthDeg` is 0 over the dial crown-side, `polarDeg` is measured down from straight overhead
 * (three's convention, matching the posture tokens), `zoom` is a distance multiplier.
 */
export interface Pose {
  readonly azimuthDeg: number;
  readonly polarDeg: number;
  readonly zoom: number;
}

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Build a `CaptionCamera` for a pose around the pilot's pivot.
 *
 * Distance is derived from the scene's frame-fill so that a normal-sized watch fills the same
 * fraction of any viewport — the same framing the model loader's `fitCameraDistance` targets — and
 * `zoom` scales it. Pure and deterministic so the overlay px positions and a shared URL agree.
 */
export function cameraForPose(pose: Pose, viewport: Viewport): CaptionCamera {
  const aspect = viewport.widthPx > 0 ? viewport.heightPx / viewport.widthPx : 1;
  // Base framing distance for a ~40 mm case at the reference fov, in metres. sceneTokens.frameFill
  // is a ratio, not a distance; 0.22 m is the R3F default framing distance that canvas-host.tsx
  // opens on, so an unzoomed pose reproduces what the buyer first sees.
  const baseDistance = 0.22 / clamp(pose.zoom, 0.25, 4);
  const polar = clamp(pose.polarDeg, 2, 178) * DEG;
  const azimuth = pose.azimuthDeg * DEG;
  const offset: Vec3 = [
    baseDistance * Math.sin(polar) * Math.sin(azimuth),
    baseDistance * Math.cos(polar),
    baseDistance * Math.sin(polar) * Math.cos(azimuth),
  ];
  return {
    position: [sceneTokens.pivot.x + offset[0], sceneTokens.pivot.y + offset[1], sceneTokens.pivot.z + offset[2]],
    target: [sceneTokens.pivot.x, sceneTokens.pivot.y, sceneTokens.pivot.z],
    up: [0, 1, 0],
    fovDeg: sceneTokens.cameraFovDeg,
    aspect: viewport.widthPx > 0 && viewport.heightPx > 0 ? viewport.widthPx / viewport.heightPx : 1,
    near: sceneTokens.cameraNear,
  };
}
