const bunTestSpecifier = 'bun:test';
const bunTest = await import(bunTestSpecifier);
const { describe, test } = bunTest as {
  describe: (name: string, fn: () => void) => void;
  test: (name: string, fn: () => void | Promise<void>) => void;
};
/** `bun:test` ships no declarations in this workspace, and naming every matcher in a cast is how a
 *  test file stops compiling before it stops passing. The matcher object stays dynamic. */
const expect = bunTest.expect;

import type { ConditionCaption } from '@nastech/api-contracts';
import { azimuthDistance, clampAngles, isWithinGeometry, polarLimits, type CaptureGeometry } from './constrained-orbit.js';
import {
  PITCH_STEP_DEG,
  YAW_STEP_DEG,
  ZOOM_KEY_STEP,
  advancePose,
  buildPoseCatalogue,
  canonicalStops,
  describeView,
  hourLabel,
  intentForKey,
  nearestPose,
  poseIdFor,
  snapAngles,
  type CameraPose,
} from './keyboard-rotate.js';

const FRONT_ROW: CaptureGeometry = { allowedAzimuthRange: [-180, 180], allowedPolarRange: [60, 90] };
const DIAL_ONLY: CaptureGeometry = { allowedAzimuthRange: [-45, 45], allowedPolarRange: [40, 95] };
const WITH_BACK: CaptureGeometry = { allowedAzimuthRange: [-180, 180], allowedPolarRange: [30, 170] };

const hairlineAtTwoOClock: ConditionCaption = {
  hotspotId: 'h-flank-2',
  position: [0.5, 0.02, 0.86],
  disclosureText: 'Hairline on the case flank, caught on a door frame',
  severity: 'cosmetic',
  disclosureId: 'D-118',
};
const engravingOnBack: ConditionCaption = {
  hotspotId: 'h-back',
  position: [0, -1, 0.02],
  disclosureText: 'Case-back engraving is legible',
  severity: 'unknown',
  disclosureId: 'D-119',
};

const byId = (poses: readonly CameraPose[], id: string): CameraPose => poses.find((p) => p.id === id)!;

describe('named poses', () => {
  test('the grid quantum is the announced one: 15 degrees of yaw, 10 of pitch', () => {
    expect(YAW_STEP_DEG).toBe(15);
    expect(PITCH_STEP_DEG).toBe(10);
    const catalogue = buildPoseCatalogue(FRONT_ROW, []);
    const firstRow = catalogue.rows[0]!.poses;
    // Consecutive cells are 15 degrees apart measured as an arc, because a full-turn band starts at
    // the seam and 180/-180 are the same direction.
    for (let i = 1; i < firstRow.length; i += 1) {
      expect(Math.abs(azimuthDistance(firstRow[i - 1]!.azimuthDeg, firstRow[i]!.azimuthDeg))).toBe(15);
    }
    expect(catalogue.rows[1]!.polarDeg - catalogue.rows[0]!.polarDeg).toBe(10);
  });

  test('a pose id names its cell and nothing else, so it round-trips', () => {
    expect(poseIdFor({ azimuthDeg: 15, polarDeg: 70 })).toBe('az+015_pol+070');
    expect(poseIdFor({ azimuthDeg: -180, polarDeg: 100 })).toBe('az+180_pol+100');
    const catalogue = buildPoseCatalogue(FRONT_ROW, []);
    for (const pose of catalogue.poses) expect(pose.id).toBe(poseIdFor(pose));
  });

  test('no cell exists outside the recorded geometry', () => {
    for (const geometry of [FRONT_ROW, DIAL_ONLY, WITH_BACK]) {
      const catalogue = buildPoseCatalogue(geometry, []);
      for (const pose of catalogue.poses) {
        expect(isWithinGeometry(geometry, pose, 1e-6)).toBe(true);
      }
    }
  });

  test('the case back is only named as a case back when the capture has one', () => {
    const noBack = buildPoseCatalogue(DIAL_ONLY, []);
    expect(noBack.poses.some((p) => p.label.startsWith('case back'))).toBe(false);
    const withBack = buildPoseCatalogue(WITH_BACK, []);
    expect(withBack.poses.some((p) => p.label.startsWith('case back'))).toBe(true);
    expect(describeView({ azimuthDeg: 0, polarDeg: 150 }, DIAL_ONLY)).toBe('case underside');
  });

  test('crystal, dial, flank and crown read as views of a watch, not as numbers', () => {
    expect(describeView({ azimuthDeg: 0, polarDeg: 75 }, FRONT_ROW)).toBe('dial face, 12 o\'clock');
    expect(describeView({ azimuthDeg: 60, polarDeg: 75 }, FRONT_ROW)).toBe('dial face, 2 o\'clock');
    expect(describeView({ azimuthDeg: 90, polarDeg: 90 }, FRONT_ROW)).toBe('crown, 3 o\'clock side');
    expect(describeView({ azimuthDeg: 0, polarDeg: 20 }, WITH_BACK)).toBe('crystal, viewed from above');
    expect(describeView({ azimuthDeg: 7, polarDeg: 90 }, FRONT_ROW)).toContain('case flank');
  });

  test('clock words cover the half-hour cells honestly', () => {
    expect(hourLabel(0)).toBe('12 o\'clock');
    expect(hourLabel(90)).toBe('3 o\'clock');
    expect(hourLabel(-90)).toBe('9 o\'clock');
    expect(hourLabel(180)).toBe('6 o\'clock');
    expect(hourLabel(15)).toBe('between 12 and 1 o\'clock');
    expect(hourLabel(-15)).toBe('between 11 and 12 o\'clock');
  });
});

describe('caption pairing', () => {
  test('every caption in the manifest is reachable from a named pose', () => {
    const catalogue = buildPoseCatalogue(FRONT_ROW, [hairlineAtTwoOClock]);
    expect(catalogue.unreachableCaptions).toEqual([]);
    const holder = catalogue.poses.filter((p) => p.hotspotIds.includes('h-flank-2'));
    expect(holder.length).toBeGreaterThan(0);
    // The hotspot sits at 2 o'clock, so the poses that can see it must be named for that side.
    expect(holder.map((p) => p.label).join(' ')).toContain('2 o\'clock');
    expect(holder[0]!.captions[0]!.disclosureText).toBe(hairlineAtTwoOClock.disclosureText);
  });

  test('a hotspot the clamp cannot reach is reported, not dropped', () => {
    const catalogue = buildPoseCatalogue(DIAL_ONLY, [engravingOnBack]);
    expect(catalogue.unreachableCaptions.map((c) => c.hotspotId)).toEqual(['h-back']);
    expect(catalogue.poses.some((p) => p.hotspotIds.includes('h-back'))).toBe(false);
  });

  test('a case-back hotspot is attached to the back rows and to nothing on the dial', () => {
    const catalogue = buildPoseCatalogue(WITH_BACK, [engravingOnBack]);
    const holders = catalogue.poses.filter((p) => p.hotspotIds.includes('h-back'));
    expect(holders.length).toBeGreaterThan(0);
    for (const pose of holders) expect(pose.polarDeg).toBeGreaterThan(polarLimits(WITH_BACK)[1] - 60);
    expect(holders.some((p) => p.label.startsWith('case back'))).toBe(true);
  });
});

describe('the announced tour', () => {
  test('contains only captioned poses when the capture has captions', () => {
    const catalogue = buildPoseCatalogue(FRONT_ROW, [hairlineAtTwoOClock, engravingOnBack]);
    expect(catalogue.captioned).toBe(true);
    expect(catalogue.tour.length).toBeGreaterThan(0);
    for (const pose of catalogue.tour) expect(pose.captions.length > 0).toBe(true);
  });

  test('the home pose is the cell nearest the requested dial view', () => {
    const catalogue = buildPoseCatalogue(FRONT_ROW, [hairlineAtTwoOClock]);
    const home = byId(catalogue.poses, catalogue.homeId);
    expect(Math.abs(home.polarDeg - 75)).toBeLessThanOrEqual(PITCH_STEP_DEG / 2);
    expect(Math.abs(azimuthDistance(home.azimuthDeg, 0))).toBeLessThanOrEqual(YAW_STEP_DEG / 2);
  });

  test('the tour is ordered by distance from the home row, then by cell, so it never wanders', () => {
    const catalogue = buildPoseCatalogue(WITH_BACK, [hairlineAtTwoOClock, engravingOnBack]);
    const home = byId(catalogue.poses, catalogue.homeId);
    expect(catalogue.tour.length).toBeGreaterThan(catalogue.rows.length);
    const rowDistance = (p: CameraPose) => Math.abs(p.polarDeg - home.polarDeg);
    for (let i = 1; i < catalogue.tour.length; i += 1) {
      const prev = catalogue.tour[i - 1]!;
      const next = catalogue.tour[i]!;
      const order = rowDistance(prev) - rowDistance(next);
      expect(order <= 0 || (order === 0 && next.cell > prev.cell)).toBe(true);
    }
  });
});

describe('arrow-key sequence', () => {
  test('pressing Right from home is deterministic and lands on named captioned poses', () => {
    const catalogue = buildPoseCatalogue(FRONT_ROW, [hairlineAtTwoOClock, engravingOnBack]);
    const run = () => {
      let pose = byId(catalogue.poses, catalogue.homeId);
      const seen: string[] = [pose.id];
      for (let i = 0; i < 5; i += 1) {
        pose = advancePose(catalogue, pose, { yawDeg: YAW_STEP_DEG, pitchDeg: 0 }).pose;
        seen.push(pose.id);
      }
      return seen;
    };
    const first = run();
    expect(run()).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
    const angles = first.map((id) => byId(catalogue.poses, id));
    for (const pose of angles) expect(isWithinGeometry(FRONT_ROW, pose, 1e-6)).toBe(true);
    // Never less than the quantum: a press that moves 3 degrees is an anonymous transform in disguise.
    for (let i = 1; i < angles.length; i += 1) {
      expect(Math.abs(angles[i]!.azimuthDeg - angles[i - 1]!.azimuthDeg)).toBeGreaterThanOrEqual(YAW_STEP_DEG);
    }
  });

  test('a vertical press moves exactly one polar row', () => {
    const catalogue = buildPoseCatalogue(WITH_BACK, []);
    const home = byId(catalogue.poses, catalogue.homeId);
    const up = advancePose(catalogue, home, { yawDeg: 0, pitchDeg: -PITCH_STEP_DEG });
    expect(up.blocked).toBe(false);
    expect(home.polarDeg - up.pose.polarDeg).toBe(PITCH_STEP_DEG);
    const down = advancePose(catalogue, home, { yawDeg: 0, pitchDeg: PITCH_STEP_DEG });
    expect(down.pose.polarDeg - home.polarDeg).toBe(PITCH_STEP_DEG);
  });

  test('running into the edge of the capture reports the block instead of wrapping', () => {
    const catalogue = buildPoseCatalogue(DIAL_ONLY, []);
    let pose = byId(catalogue.poses, catalogue.homeId);
    let blocked = false;
    for (let i = 0; i < 20 && !blocked; i += 1) {
      const next = advancePose(catalogue, pose, { yawDeg: YAW_STEP_DEG, pitchDeg: 0 });
      pose = next.pose;
      blocked = next.blocked;
    }
    expect(blocked).toBe(true);
    // The last legal cell is the band edge itself: it stopped, it did not wrap round to 12 o'clock.
    expect(pose.azimuthDeg).toBe(45);
    expect(pose.id).not.toBe(byId(catalogue.poses, catalogue.homeId).id);
    expect(isWithinGeometry(DIAL_ONLY, pose, 1e-6)).toBe(true);
  });

  test('uncaptioned cells are skipped rather than announced as silence', () => {
    const catalogue = buildPoseCatalogue(FRONT_ROW, [hairlineAtTwoOClock]);
    const captionedCells = catalogue.poses.filter((p) => p.captions.length > 0).map((p) => p.id);
    let pose = byId(catalogue.poses, catalogue.homeId);
    const landed: string[] = [];
    for (let i = 0; i < 23; i += 1) {
      pose = advancePose(catalogue, pose, { yawDeg: YAW_STEP_DEG, pitchDeg: 0 }).pose;
      landed.push(pose.id);
    }
    for (const id of landed) expect(captionedCells).toContain(id);
  });

  test('a zero step is a no-op, not a jump to the tour start', () => {
    const catalogue = buildPoseCatalogue(FRONT_ROW, [hairlineAtTwoOClock]);
    const home = byId(catalogue.poses, catalogue.homeId);
    expect(advancePose(catalogue, home, { yawDeg: 0, pitchDeg: 0 }).pose.id).toBe(home.id);
  });
});

describe('key map', () => {
  test('the pinned keys resolve to intents and everything else is left to the page', () => {
    expect(intentForKey('ArrowRight')).toEqual({ kind: 'orbit_step', yawDeg: 15, pitchDeg: 0 });
    expect(intentForKey('ArrowLeft')).toEqual({ kind: 'orbit_step', yawDeg: -15, pitchDeg: 0 });
    expect(intentForKey('ArrowUp')).toEqual({ kind: 'orbit_step', yawDeg: 0, pitchDeg: -10 });
    expect(intentForKey('ArrowDown')).toEqual({ kind: 'orbit_step', yawDeg: 0, pitchDeg: 10 });
    expect(intentForKey('+')).toEqual({ kind: 'zoom_step', delta: ZOOM_KEY_STEP });
    expect(intentForKey('=')).toEqual({ kind: 'zoom_step', delta: ZOOM_KEY_STEP });
    expect(intentForKey('-')).toEqual({ kind: 'zoom_step', delta: -ZOOM_KEY_STEP });
    expect(intentForKey('Home')).toEqual({ kind: 'reset' });
    expect(intentForKey('q')).toBeNull();
    expect(intentForKey('Tab')).toBeNull();
    expect(intentForKey('Escape')).toBeNull();
  });
});

describe('snapping and stops', () => {
  test('snapAngles lands on the grid and inside the band, even from a wild request', () => {
    for (const requested of [{ azimuthDeg: 47.3, polarDeg: 173.9 }, { azimuthDeg: -400, polarDeg: -20 }, { azimuthDeg: 361, polarDeg: 88 }]) {
      const snapped = snapAngles(DIAL_ONLY, requested, { yaw: YAW_STEP_DEG, pitch: PITCH_STEP_DEG });
      const [polMin, polMax] = polarLimits(DIAL_ONLY);
      expect(Math.abs(snapped.azimuthDeg % 15)).toBe(0);
      // A band edge that is not a grid multiple wins over the grid: the capture's limit is the law.
      expect(snapped.polarDeg % 10 === 0 || snapped.polarDeg === polMin || snapped.polarDeg === polMax).toBe(true);
      expect(isWithinGeometry(DIAL_ONLY, snapped, 1e-6)).toBe(true);
    }
  });

  test('nearestPose resolves a clamped off-grid angle to a real cell', () => {
    const catalogue = buildPoseCatalogue(DIAL_ONLY, []);
    const angles = clampAngles(DIAL_ONLY, { azimuthDeg: 12, polarDeg: 95 });
    const pose = nearestPose(catalogue, angles);
    expect(catalogue.poses.map((p) => p.id)).toContain(pose.id);
    expect(nearestPose(catalogue, angles).id).toBe(pose.id);
  });

  test('the uncaptioned button surface is a handful of named stops, not the whole grid', () => {
    const catalogue = buildPoseCatalogue(WITH_BACK, []);
    const stops = canonicalStops(catalogue, WITH_BACK);
    expect(stops.length).toBeLessThan(catalogue.poses.length);
    expect(stops.length).toBeGreaterThan(2);
    expect(new Set(stops.map((s) => s.id)).size).toBe(stops.length);
    for (const stop of stops) expect(isWithinGeometry(WITH_BACK, stop, 1e-6)).toBe(true);
  });

  test('a capture with no back cannot produce a back stop', () => {
    const catalogue = buildPoseCatalogue(DIAL_ONLY, []);
    const stops = canonicalStops(catalogue, DIAL_ONLY);
    expect(stops.some((s) => s.label.startsWith('case back'))).toBe(false);
  });
});
