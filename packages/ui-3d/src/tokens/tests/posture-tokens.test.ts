import { describe, expect, it } from 'bun:test';
import { cameraPoses, POSTURE_IDS, POSE_LIMITS, postureById, poseOrder, type CameraPose } from '../posture-tokens.js';

/**
 * A pose names where you are looking. It must never be the place a claim of inspection, service or
 * authenticity gets made: the render shows external geometry and the text carries every condition
 * claim, so a label that reads like a check has happened is a product-rule violation in data form.
 */
const FORBIDDEN_LABEL_WORDS = [
  'verified',
  'authentic',
  'genuine',
  'checked',
  'inspected',
  'serviced',
  'guaranteed',
  'waterproof',
  'working',
];

const DIAL_POSES = ['dial-face', 'three-oclock', 'six-oclock'];

function fields(pose: CameraPose): readonly (keyof CameraPose)[] {
  return Object.keys(pose) as (keyof CameraPose)[];
}

/** The tree's ambient `bun:test` shim types the matchers the suite uses; a plain predicate keeps
 *  these assertions honest without depending on the ones it omits. */
function matches(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}

describe('posture tokens: the announced surface', () => {
  it('offers the six views of a watch and no others', () => {
    expect(POSTURE_IDS).toEqual(['dial-face', 'three-oclock', 'six-oclock', 'case-back', 'clasp', 'crown']);
    expect(cameraPoses.map((p) => p.id)).toEqual([...POSTURE_IDS]);
  });

  it('ids are unique, slug-shaped and stable to look up', () => {
    expect(new Set(POSTURE_IDS).size).toBe(POSTURE_IDS.length);
    for (const id of POSTURE_IDS) {
      expect(matches(id, /^[a-z0-9]+(-[a-z0-9]+)*$/)).toBe(true);
      expect(postureById(id)).toBe(cameraPoses.find((p) => p.id === id));
    }
    expect(postureById('no-such-pose')).toBeUndefined();
  });

  it('every label reads aloud: non-empty, trimmed, unique, no bare numerals', () => {
    const labels = cameraPoses.map((p) => p.label);
    for (const pose of cameraPoses) {
      expect(pose.label.length).toBeGreaterThan(0);
      expect(pose.label).toBe(pose.label.trim());
      // "3" is spoken correctly by most engines but "3 o'clock" is read as a fraction by some; the
      // spelled form costs nothing and removes the question.
      expect(matches(pose.label, /[0-9]/)).toBe(false);
      expect(matches(pose.label, /^[A-Z]/)).toBe(true);
      expect(pose.label.split(/\s+/).length).toBeLessThanOrEqual(6);
    }
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('no label claims a check the render did not perform', () => {
    for (const pose of cameraPoses) {
      const lower = pose.label.toLowerCase();
      for (const word of FORBIDDEN_LABEL_WORDS) {
        expect(lower.includes(word)).toBe(false);
      }
    }
  });

  it('a label says what you are looking at without needing the id', () => {
    // The announced text is the whole affordance: "Case back" must make sense spoken on its own.
    expect(postureById('case-back')!.label).toBe('Case back');
    expect(postureById('crown')!.label).toBe('Winding crown');
    expect(postureById('clasp')!.label).toBe('Bracelet clasp');
    expect(postureById('dial-face')!.label).toContain('dial');
  });
});

describe('posture tokens: the geometry', () => {
  it('carries exactly the fields the controls announce and nothing else', () => {
    for (const pose of cameraPoses) {
      expect([...fields(pose)].sort()).toEqual(['azimuth', 'id', 'label', 'polar', 'zoom']);
      expect(Object.getPrototypeOf(pose)).toBe(Object.prototype);
    }
  });

  it('angles are finite and inside the documented ranges', () => {
    for (const pose of cameraPoses) {
      for (const value of [pose.azimuth, pose.polar, pose.zoom]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(pose.azimuth).toBeGreaterThanOrEqual(POSE_LIMITS.azimuthMin);
      expect(pose.azimuth).toBeLessThanOrEqual(POSE_LIMITS.azimuthMax);
      expect(pose.polar).toBeGreaterThanOrEqual(POSE_LIMITS.polarMin);
      expect(pose.polar).toBeLessThanOrEqual(POSE_LIMITS.polarMax);
      expect(pose.zoom).toBeGreaterThanOrEqual(POSE_LIMITS.zoomMin);
      expect(pose.zoom).toBeLessThanOrEqual(POSE_LIMITS.zoomMax);
    }
  });

  it('follows the polar convention it documents: dial above, case back below', () => {
    for (const id of DIAL_POSES) {
      expect(postureById(id)!.polar).toBeLessThan(90);
    }
    expect(postureById('case-back')!.polar).toBeGreaterThan(90);
    expect(postureById('case-back')!.polar).toBeGreaterThan(postureById('dial-face')!.polar);
  });

  it('puts the crown and the three o clock side on the same azimuth, and the clasp opposite', () => {
    expect(postureById('crown')!.azimuth).toBe(postureById('three-oclock')!.azimuth);
    expect(postureById('clasp')!.azimuth).toBe(270);
    expect(postureById('six-oclock')!.azimuth).toBe(180);
  });

  it('the small parts come in closer than the whole watch', () => {
    expect(postureById('crown')!.zoom).toBeGreaterThan(postureById('dial-face')!.zoom);
    expect(postureById('clasp')!.zoom).toBeGreaterThan(postureById('dial-face')!.zoom);
    // Dial face is the default framing, so it is the reference at 1.
    expect(postureById('dial-face')!.zoom).toBe(POSE_LIMITS.zoomMin);
  });

  it('no two case-band views share both angles', () => {
    const keys = cameraPoses.map((p) => `${p.azimuth}:${p.polar}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('poseOrder is the announcement order, dial first and the small parts last', () => {
    expect(poseOrder()).toEqual(POSTURE_IDS);
    expect(poseOrder()[0]).toBe('dial-face');
    expect(poseOrder()[poseOrder().length - 1]).toBe('crown');
  });
});
