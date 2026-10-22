/**
 * No `@types/bun` and no `@types/jsdom` in this workspace, and we may not add a dependency or a
 * shared ambient declaration (a second agent declaring the same module in the same wave collides).
 * A variable specifier types as `any` and resolves at runtime, which keeps `bun test` green without
 * teaching tsc anything global.
 */
const bunTestSpecifier = 'bun:test';
const bunTest = await import(bunTestSpecifier);
const { describe, test } = bunTest as {
  describe: (name: string, fn: () => void) => void;
  test: (name: string, fn: () => void | Promise<void>) => void;
};
/** `bun:test` ships no declarations in this workspace, and naming every matcher in a cast is how a
 *  test file stops compiling before it stops passing. The matcher object stays dynamic. */
const expect = bunTest.expect;

import {
  CASE_BACK_POLAR_DEG,
  DEFAULT_ZOOM_RANGE,
  POLAR_SINGULARITY_MARGIN_DEG,
  SAFE_DEFAULT_GEOMETRY,
  applyOrbitLimits,
  azimuthDistance,
  captionVisibleFrom,
  clampAngles,
  clampCameraOffset,
  clampZoom,
  enumerateAzimuthCells,
  enumeratePolarCells,
  geometryRecordsCaseBack,
  isWithinGeometry,
  normalizeAzimuthDeg,
  polarLimits,
  validateGeometry,
  viewDirection,
  visibleCaptions,
  type OrbitControlsLike,
} from './constrained-orbit.js';
import type { ConditionCaption } from '@nastech/api-contracts';

const DIAL_ONLY = { allowedAzimuthRange: [-45, 45] as const, allowedPolarRange: [40, 95] as const };
const FULL_TURN = { allowedAzimuthRange: [-180, 180] as const, allowedPolarRange: [10, 170] as const };
const SEAM = { allowedAzimuthRange: [170, -170] as const, allowedPolarRange: [40, 95] as const };

const captionAt = (hotspotId: string, position: readonly [number, number, number]): ConditionCaption => ({
  hotspotId,
  position,
  disclosureText: 'a hairline',
  severity: 'cosmetic',
  disclosureId: `D-${hotspotId}`,
});

describe('polar clamp', () => {
  test('an under-case-back pose is refused and lands on the last recorded row', () => {
    const clamped = clampAngles(DIAL_ONLY, { azimuthDeg: 0, polarDeg: 150 });
    const [, max] = polarLimits(DIAL_ONLY);
    expect(clamped.polarDeg).toBe(max);
    expect(isWithinGeometry(DIAL_ONLY, { azimuthDeg: 0, polarDeg: 150 })).toBe(false);
  });

  test('the camera flip past the underside pole is unreachable even for a full-turn capture', () => {
    for (const requested of [178, 190, 360, -180]) {
      const clamped = clampAngles(FULL_TURN, { azimuthDeg: 0, polarDeg: requested });
      expect(clamped.polarDeg).toBeLessThanOrEqual(180 - POLAR_SINGULARITY_MARGIN_DEG);
      expect(clamped.polarDeg).toBeGreaterThanOrEqual(POLAR_SINGULARITY_MARGIN_DEG);
    }
  });

  test('a profile that claims the case back is the only thing that admits it', () => {
    expect(geometryRecordsCaseBack(DIAL_ONLY)).toBe(false);
    expect(geometryRecordsCaseBack({ allowedAzimuthRange: [-180, 180], allowedPolarRange: [10, CASE_BACK_POLAR_DEG] })).toBe(true);
  });

  test('the default profile is the restrictive one, not a permissive one', () => {
    expect(geometryRecordsCaseBack(SAFE_DEFAULT_GEOMETRY)).toBe(false);
    expect(clampAngles(SAFE_DEFAULT_GEOMETRY, { azimuthDeg: 0, polarDeg: 120 }).polarDeg).toBeLessThan(CASE_BACK_POLAR_DEG);
  });
});

describe('azimuth clamp', () => {
  test('snaps to the nearer recorded edge', () => {
    expect(clampAngles(DIAL_ONLY, { azimuthDeg: 90, polarDeg: 75 }).azimuthDeg).toBe(45);
    expect(clampAngles(DIAL_ONLY, { azimuthDeg: -90, polarDeg: 75 }).azimuthDeg).toBe(-45);
  });

  test('a band that crosses the seam is inside at 175 and outside at 0, with a deterministic tie', () => {
    expect(isWithinGeometry(SEAM, { azimuthDeg: 175, polarDeg: 75 })).toBe(true);
    expect(clampAngles(SEAM, { azimuthDeg: 0, polarDeg: 75 }).azimuthDeg).toBe(-170);
    expect(clampAngles(SEAM, { azimuthDeg: 30, polarDeg: 75 }).azimuthDeg).toBe(170);
    expect(clampAngles(SEAM, { azimuthDeg: -30, polarDeg: 75 }).azimuthDeg).toBe(-170);
  });

  test('a full turn keeps every angle and only normalises', () => {
    expect(clampAngles(FULL_TURN, { azimuthDeg: 400, polarDeg: 75 }).azimuthDeg).toBe(40);
    expect(normalizeAzimuthDeg(-180)).toBe(180);
    expect(azimuthDistance(170, -170)).toBe(20);
  });

  test('every enumerated cell is inside the geometry it came from', () => {
    for (const geometry of [DIAL_ONLY, FULL_TURN, SEAM, SAFE_DEFAULT_GEOMETRY]) {
      const aLegalAzimuth = enumerateAzimuthCells(geometry, 15)[0]!;
      for (const azimuthDeg of enumerateAzimuthCells(geometry, 15)) {
        expect(isWithinGeometry(geometry, { azimuthDeg, polarDeg: 70 }, 1e-6)).toBe(true);
      }
      for (const polarDeg of enumeratePolarCells(geometry, 10)) {
        expect(isWithinGeometry(geometry, { azimuthDeg: aLegalAzimuth, polarDeg }, 1e-6)).toBe(true);
      }
    }
  });
});

describe('geometry validation', () => {
  test('refuses profiles that would silently permit an unrecorded view', () => {
    expect(() => validateGeometry({ allowedAzimuthRange: [0, 90], allowedPolarRange: [120, 40] })).toThrow();
    expect(() => validateGeometry({ allowedAzimuthRange: [0, 90], allowedPolarRange: [-10, 40] })).toThrow();
    expect(() => validateGeometry({ allowedAzimuthRange: [0, 90], allowedPolarRange: [Number.NaN, 40] })).toThrow();
    expect(() => validateGeometry({ allowedAzimuthRange: [45, 45], allowedPolarRange: [40, 90] })).toThrow();
    expect(() => validateGeometry({ allowedAzimuthRange: [0, 400], allowedPolarRange: [40, 90] })).toThrow();
  });

  test('accepts the three shapes a real capture profile takes', () => {
    expect(() => validateGeometry(DIAL_ONLY)).not.toThrow();
    expect(() => validateGeometry(FULL_TURN)).not.toThrow();
    expect(() => validateGeometry(SEAM)).not.toThrow();
  });
});

describe('view direction and caption pairing', () => {
  test('the angle convention maps to the expected unit vectors', () => {
    const close = (v: readonly number[], e: readonly number[]) => v.forEach((part, i) => expect(part).toBeCloseTo(e[i] as number, 9));
    close(viewDirection({ azimuthDeg: 0, polarDeg: 90 }), [0, 0, 1]);
    close(viewDirection({ azimuthDeg: 90, polarDeg: 90 }), [1, 0, 0]);
    close(viewDirection({ azimuthDeg: 0, polarDeg: 0 }), [0, 1, 0]);
    close(viewDirection({ azimuthDeg: 0, polarDeg: 180 }), [0, -1, 0]);
    close(viewDirection({ azimuthDeg: -90, polarDeg: 90 }), [-1, 0, 0]);
  });

  test('a dial hotspot is visible from the front and invisible from behind', () => {
    const dial = captionAt('h-dial', [0, 0, 1]);
    expect(captionVisibleFrom(dial, { azimuthDeg: 0, polarDeg: 90 })).toBe(true);
    expect(captionVisibleFrom(dial, { azimuthDeg: 180, polarDeg: 90 })).toBe(false);
    expect(captionVisibleFrom(dial, { azimuthDeg: 45, polarDeg: 90 })).toBe(true);
  });

  test('a case-back hotspot needs the camera under the item', () => {
    const back = captionAt('h-back', [0, -1, 0]);
    expect(captionVisibleFrom(back, { azimuthDeg: 0, polarDeg: 160 })).toBe(true);
    expect(captionVisibleFrom(back, { azimuthDeg: 0, polarDeg: 30 })).toBe(false);
  });

  test('a degenerate hotspot falls back to the front normal instead of glowing everywhere', () => {
    const centre = captionAt('h-centre', [0, 0, 0]);
    expect(captionVisibleFrom(centre, { azimuthDeg: 0, polarDeg: 90 })).toBe(true);
    expect(captionVisibleFrom(centre, { azimuthDeg: 180, polarDeg: 90 })).toBe(false);
  });

  test('visibleCaptions returns the disclosure set the text path must carry', () => {
    const captions = [captionAt('front', [0, 0, 1]), captionAt('crown', [1, 0, 0]), captionAt('back', [0, -1, 0])];
    expect(visibleCaptions(captions, { azimuthDeg: 0, polarDeg: 90 }).map((c) => c.hotspotId)).toEqual(['front']);
    expect(visibleCaptions(captions, { azimuthDeg: 40, polarDeg: 90 }).map((c) => c.hotspotId)).toEqual(['front', 'crown']);
    expect(visibleCaptions(captions, { azimuthDeg: 90, polarDeg: 90 }).map((c) => c.hotspotId)).toEqual(['crown']);
  });
});

describe('zoom clamp', () => {
  test('bounds the range on both sides and refuses nonsense', () => {
    expect(clampZoom(DEFAULT_ZOOM_RANGE, 10)).toBe(DEFAULT_ZOOM_RANGE[1]);
    expect(clampZoom(DEFAULT_ZOOM_RANGE, 0.01)).toBe(DEFAULT_ZOOM_RANGE[0]);
    expect(clampZoom(DEFAULT_ZOOM_RANGE, Number.NaN)).toBe(DEFAULT_ZOOM_RANGE[0]);
    expect(clampZoom(DEFAULT_ZOOM_RANGE, 1.5)).toBe(1.5);
  });
});

describe('scene-side enforcement', () => {
  test('clamps a camera someone put under the item anyway', () => {
    const offset = clampCameraOffset(DIAL_ONLY, [0, -0.4, 0]);
    const [, y] = offset;
    const polarDeg = (Math.acos(Math.min(1, Math.max(-1, y / 0.4))) * 180) / Math.PI;
    // The band stops at 95°, so the answer is the ceiling itself, not "somewhere above level".
    expect(polarDeg).toBeCloseTo(polarLimits(DIAL_ONLY)[1], 6);
    expect(isWithinGeometry(DIAL_ONLY, { azimuthDeg: 0, polarDeg }, 1e-4)).toBe(true);
  });

  test('keeps the radius, because zoom is a separate law from angle', () => {
    const offset = clampCameraOffset(FULL_TURN, [0, 0.4, 0]);
    expect(Math.hypot(offset[0], offset[1], offset[2])).toBeCloseTo(0.4, 6);
  });

  test('writes drei limits in radians from degrees', () => {
    const controls = fakeControls([0, 0, 0.5]);
    applyOrbitLimits(controls, { ...FULL_TURN, zoomRange: [0.5, 2] });
    const rad = (d: number) => (d * Math.PI) / 180;
    const [minP, maxP] = polarLimits(FULL_TURN);
    expect(controls.minPolarAngle).toBeCloseTo(rad(minP), 9);
    expect(controls.maxPolarAngle).toBeCloseTo(rad(maxP), 9);
    expect(controls.minDistance).toBeCloseTo(0.5 / 2, 9);
    expect(controls.maxDistance).toBeCloseTo(0.5 / 0.5, 9);
    expect(controls.minAzimuthAngle).toBe(-Infinity);
    expect(controls.maxAzimuthAngle).toBe(Infinity);
  });

  test('a seam-crossing band is left unbounded in drei rather than bounded wrongly', () => {
    const controls = fakeControls([0, 0, 0.5]);
    applyOrbitLimits(controls, { ...SEAM, zoomRange: DEFAULT_ZOOM_RANGE });
    expect(controls.minAzimuthAngle).toBe(-Infinity);
    expect(controls.maxAzimuthAngle).toBe(Infinity);
    expect(controls.maxPolarAngle).toBeCloseTo((polarLimits(SEAM)[1] * Math.PI) / 180, 9);
  });
});

function fakeControls(cameraPosition: readonly [number, number, number]): OrbitControlsLike {
  return {
    minAzimuthAngle: 0,
    maxAzimuthAngle: 0,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI,
    minDistance: 0,
    maxDistance: 0,
    enableRotate: true,
    target: { x: 0, y: 0, z: 0 },
    object: { position: { x: cameraPosition[0], y: cameraPosition[1], z: cameraPosition[2] } },
  };
}
