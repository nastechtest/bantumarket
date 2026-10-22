import type { ConditionCaption } from '@nastech/api-contracts';
import { dist3, normalize3, projectPoint, sub3, type CaptionCamera, type Projection, type Vec3, type Viewport } from './caption-projector.js';

/**
 * Occlusion-aware hotspot placement (brief 03, module 2).
 *
 * A hotspot on the far side of the case must be hidden, not drawn through the metal. Which
 * technique, and why: this is an analytic facing test against the model's convex bounding sphere
 * — NOT a GPU raycast. Three reasons, all load-bearing:
 *
 *  1. Determinism. A raycast depends on which LOD mesh is resident; the pilot streams lod0..lod2
 *     and a hotspot could flicker into existence mid-stream when a coarser hull swings a facet
 *     past the camera. The hull decision is frame-independent.
 *  2. The DOM boundary. Overlays are DOM text (rule 1: they must work with no GL context at all,
 *     and the fence must keep `three` out of anything the static path could touch). Importing
 *     THREE.Raycaster here would drag the scene runtime into the overlay module for a dot product.
 *  3. The geometry justifies it. The pilot item is a watch case: round, convex, and the bounding
 *     sphere is a tight fit. A point on the far side of a convex body has a surface normal facing
 *     away from the eye — that is exactly the test below, and it is the same test a depth buffer
 *     would resolve for a convex hull.
 *
 * Known limit, stated rather than hidden: a concave item (a bracelet dangling forward) can put a
 * nominally "far-side" hotspot in view. If a category with real concavity ships, the fix is to
 * tighten `ConvexBounds` per-caption, not to abandon the facing test.
 */

export interface ConvexBounds {
  /** Unit space, same frame as `ConditionCaption.position`. */
  readonly center: Vec3;
  readonly radiusUnits: number;
}

export interface HotspotPlacement {
  readonly hotspotId: string;
  readonly projection: Projection;
  /** True when the marker must not be drawn at all. */
  readonly occluded: boolean;
  /**
   * Dot of the surface normal with the direction toward the eye, in [-1, 1]. Callers may fade
   * markers approaching the limb (|facing| < ~0.15 wobbles as the model orbits).
   */
  readonly facing: number;
}

const DEGENERATE_EPS = 1e-9;

export function facingAt(point: Vec3, cameraPosition: Vec3, bounds: ConvexBounds): number {
  const offset = sub3(point, bounds.center);
  const distance = Math.hypot(offset[0], offset[1], offset[2]);
  // A marker at the hull centre (e.g. dial text dead-centre) has no meaningful normal; treat it
  // as front-facing rather than hiding evidence because the maths is unsure.
  if (distance < DEGENERATE_EPS || !(bounds.radiusUnits > 0)) return 1;
  const normal: Vec3 = [offset[0] / distance, offset[1] / distance, offset[2] / distance];
  const toEye = normalize3(sub3(cameraPosition, point));
  return normal[0] * toEye[0] + normal[1] * toEye[1] + normal[2] * toEye[2];
}

export function placeHotspot(
  caption: Pick<ConditionCaption, 'hotspotId' | 'position'>,
  camera: CaptionCamera,
  viewport: Viewport,
  bounds: ConvexBounds,
): HotspotPlacement {
  const projection = projectPoint(caption.position, camera, viewport);
  const facing = facingAt(caption.position, camera.position, bounds);
  return { hotspotId: caption.hotspotId, projection, facing, occluded: projection.behind || facing <= 0 };
}

/** Distance the caption sits outside the hull, in unit space. >0 means the marker floats free. */
export function hullClearance(point: Vec3, bounds: ConvexBounds): number {
  return dist3(point, bounds.center) - bounds.radiusUnits;
}
