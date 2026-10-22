/**
 * Depth parallax for the pilot item page's scene (07 §5.2 — the one reclassified effect
 * that returns, narrowly: parallax *inside* the scene, driven by the model's own camera,
 * high-LOD path only).
 *
 * Pure math, `(pose, layers) => offsets`. No DOM writes, no requestAnimationFrame, no
 * listener: the caller (ui-3d's viewer, once the controller wires it) owns the frame loop
 * and applies the offsets to its camera layers. Keeping this side-effect-free is what lets
 * the static path and the scene path share one definition of the effect's bounds.
 */

import { motionOk } from './reduced-motion.js';

/** Pointer/camera pose in CSS pixels relative to the item-page viewport. */
export interface ParallaxPose {
  readonly pointerX: number;
  readonly pointerY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

/** One scene layer. `depth` 0 sits at the focal plane and never moves; 1 is the furthest
 *  back and travels up to `maxOffsetPx`. `maxOffsetPx` is the declared bound — output is
 *  guaranteed inside it, which is what makes the effect tunable by an artist, not by luck. */
export interface ParallaxLayer {
  readonly depth: number;
  readonly maxOffsetPx: number;
}

export interface ParallaxOffset {
  readonly x: number;
  readonly y: number;
}

const ZERO: ParallaxOffset = { x: 0, y: 0 };

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The y inversion can produce -0; callers round-trip these into transforms and test
 *  equality, so the API promises one zero, not two. */
function dropNegZero(v: number): number {
  return v === 0 ? 0 : v;
}

/** Pixel coordinate to [-1, 1] about the viewport centre. Non-positive or non-finite
 *  viewport dimensions must not produce NaN — a zero-size viewport simply has no pose. */
function normalize(px: number, size: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(size) || size <= 0) return 0;
  return clamp((px / size) * 2 - 1, -1, 1);
}

/**
 * Offsets for every layer, in layer order. Zero under reduced motion (motionOk('parallax'))
 * — the gate lives here so every caller gets the contract for free; a caller that "forgot"
 * to check would silently break the rule on the highest-flourish surface in the product.
 */
export function parallaxOffsets(pose: ParallaxPose, layers: readonly ParallaxLayer[]): ParallaxOffset[] {
  if (!motionOk('parallax')) return layers.map(() => ({ ...ZERO }));

  const nx = normalize(pose.pointerX, pose.viewportWidth);
  const ny = normalize(pose.pointerY, pose.viewportHeight);

  return layers.map((layer) => {
    const bound = Math.max(0, layer.maxOffsetPx);
    const depth = clamp(layer.depth, 0, 1);
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || bound === 0 || depth === 0) {
      return { ...ZERO };
    }
    // Deeper layers travel further (they are "further away"); y is inverted because screen
    // pixels grow downward while scene depth reads as "the world tilts up".
    return {
      x: dropNegZero(clamp(nx * depth * bound, -bound, bound)),
      y: dropNegZero(clamp(-ny * depth * bound, -bound, bound)),
    };
  });
}
