import { afterAll, describe, expect, it } from 'bun:test';
import { parallaxOffsets, type ParallaxLayer, type ParallaxPose } from '../src/parallax.js';
import { setReducedMotionOverride } from '../src/reduced-motion.js';

const LAYERS: ParallaxLayer[] = [
  { depth: 0, maxOffsetPx: 24 },
  { depth: 0.5, maxOffsetPx: 16 },
  { depth: 1, maxOffsetPx: 10 },
];

const VIEWPORT = { viewportWidth: 390, viewportHeight: 844 };

function poseAt(px: number, py: number): ParallaxPose {
  return { pointerX: px, pointerY: py, ...VIEWPORT };
}

describe('depth parallax (pure math)', () => {
  afterAll(() => setReducedMotionOverride(null));
  setReducedMotionOverride(false);

  it('centre pose yields zero offsets for every layer', () => {
    const out = parallaxOffsets(poseAt(195, 422), LAYERS);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it('offsets stay inside each layer’s declared maxOffsetPx even for absurd pointer positions', () => {
    const out = parallaxOffsets(poseAt(100_000, -100_000), LAYERS);
    out.forEach((o, i) => {
      const bound = LAYERS[i]!.maxOffsetPx;
      expect(Number.isFinite(o.x)).toBe(true);
      expect(Number.isFinite(o.y)).toBe(true);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(bound);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(bound);
    });
    // Focal plane (depth 0) never moves; that is what "depth" means here.
    expect(out[0]).toEqual({ x: 0, y: 0 });
  });

  it('is finite and zero at a zero-size viewport (no NaN from the normalisation divide)', () => {
    const out = parallaxOffsets({ pointerX: 12, pointerY: 30, viewportWidth: 0, viewportHeight: 0 }, LAYERS);
    for (const o of out) {
      expect(Number.isFinite(o.x)).toBe(true);
      expect(Number.isFinite(o.y)).toBe(true);
    }
    expect(out.every((o) => o.x === 0 && o.y === 0)).toBe(true);
  });

  it('non-finite pose input degrades to zero, never NaN', () => {
    const out = parallaxOffsets({ pointerX: NaN, pointerY: Infinity, ...VIEWPORT }, LAYERS);
    expect(out.every((o) => o.x === 0 && o.y === 0)).toBe(true);
  });

  it('deeper layers travel further for the same pose', () => {
    const out = parallaxOffsets(poseAt(390, 0), [{ depth: 0.3, maxOffsetPx: 20 }, { depth: 0.9, maxOffsetPx: 20 }]);
    expect(Math.abs(out[1]!.x)).toBeGreaterThan(Math.abs(out[0]!.x));
  });

  it('returns all-zero offsets under reduced motion, keeping layer count stable', () => {
    setReducedMotionOverride(true);
    const out = parallaxOffsets(poseAt(390, 844), LAYERS);
    expect(out.length).toBe(LAYERS.length);
    expect(out.every((o) => o.x === 0 && o.y === 0)).toBe(true);
    setReducedMotionOverride(false);
  });
});
