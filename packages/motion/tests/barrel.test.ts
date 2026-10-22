import { describe, expect, it } from 'bun:test';
import * as motion from '../src/index.js';

/**
 * The plan's rejected-effects list, enforced against this package's public surface.
 * Enumerating the barrel means adding `glassmorphismPreset`, `gradientBackdrop`,
 * `customCursor`, `magneticHover`, `cinematicPageTransition` or a `tween` helper breaks
 * a test here — the fence is the point, not the list.
 */
const FORBIDDEN = [/glass/i, /gradient/i, /cursor/i, /magnetic/i, /cinematic/i, /tween/i, /timeline/i];

describe('package surface', () => {
  it('exports nothing from the rejected-effects set', () => {
    for (const key of Object.keys(motion)) {
      for (const pattern of FORBIDDEN) {
        expect(key).not.toMatch(pattern);
      }
    }
  });

  it('exports no default — the barrel is named-only so route-level tree-shaking stays honest', () => {
    expect((motion as Record<string, unknown>).default).toBeUndefined();
  });

  it('carries the contract entry points apps and ui-3d need', () => {
    expect(typeof motion.motionOk).toBe('function');
    expect(typeof motion.prefersReducedMotion).toBe('function');
    expect(typeof motion.parallaxOffsets).toBe('function');
    expect(typeof motion.useRouteTransition).toBe('function');
    expect(typeof motion.motionCss).toBe('function');
  });

  it('the package depends on neither the scene runtime nor three (3D is never load-bearing)', () => {
    // Indirect but real check: computing every export of this barrel must succeed with no
    // WebGL, no window, and no canvas — bun test provides exactly that environment.
    expect(motion.motionCss()).toContain(':root');
    expect(motion.parallaxOffsets({ pointerX: 0, pointerY: 0, viewportWidth: 0, viewportHeight: 0 }, [])).toEqual([]);
  });
});
