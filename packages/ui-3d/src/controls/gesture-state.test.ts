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
import { isWithinGeometry, polarLimits, type CaptureGeometry } from './constrained-orbit.js';
import { YAW_STEP_DEG } from './keyboard-rotate.js';
import {
  DEFAULT_GEOMETRY,
  createGestureContext,
  createGestureState,
  createSeqSource,
  reduceGesture,
  type GestureContext,
  type GestureInput,
} from './gesture-state.js';

const DIAL_ONLY = { allowedAzimuthRange: [-90, 90] as const, allowedPolarRange: [40, 95] as const };
const hairline: ConditionCaption = {
  hotspotId: 'h-flank-2',
  position: [0.5, 0.02, 0.86],
  disclosureText: 'Hairline on the case flank',
  severity: 'cosmetic',
  disclosureId: 'D-118',
};

function context(captions: readonly ConditionCaption[] = [hairline], geometry: CaptureGeometry = DIAL_ONLY): GestureContext {
  return createGestureContext(geometry, captions, { claimScope: 'geometry_and_external_condition' });
}

let seqCounter = 0;
const next = () => (seqCounter += 1);
const orbit = (azimuthDeg: number, polarDeg: number, source: GestureInput['source'] = 'pointer'): GestureInput => ({
  kind: 'orbit',
  azimuthDeg,
  polarDeg,
  source,
  seq: next(),
});
const keyboardStep = (yawDeg: number, pitchDeg = 0): GestureInput => ({
  kind: 'intent',
  intent: { kind: 'orbit_step', yawDeg, pitchDeg },
  source: 'keyboard',
  seq: next(),
});

describe('the clamp is the state, not a suggestion', () => {
  test('no input can put an unrecorded angle in the state', () => {
    const ctx = context();
    const inputs: GestureInput[] = [
      orbit(0, 179),
      orbit(0, -30),
      orbit(175, 70),
      { kind: 'intent', intent: { kind: 'orbit', azimuthDeg: 12, polarDeg: 400 }, source: 'scene', seq: next() },
      keyboardStep(YAW_STEP_DEG),
      keyboardStep(0, 10),
    ];
    let state = createGestureState(ctx);
    for (const input of inputs) {
      state = reduceGesture(state, input, ctx);
      expect(isWithinGeometry(ctx.geometry, state.view, 1e-6)).toBe(true);
      expect(isWithinGeometry(ctx.geometry, state.pose, 1e-6)).toBe(true);
    }
    expect(state.view.polarDeg).toBeLessThanOrEqual(polarLimits(DIAL_ONLY)[1]);
  });

  test('a request past the underside is refused and the refusal is reported', () => {
    const ctx = context();
    const state = reduceGesture(createGestureState(ctx), orbit(0, 150), ctx);
    expect(state.blocked).not.toBeNull();
    expect(state.blocked!.axis).toBe('polar');
    expect(state.blocked!.direction).toBe(1);
    expect(state.view.polarDeg).toBe(polarLimits(DIAL_ONLY)[1]);
  });

  test('omitting the capture profile gets the restrictive one', () => {
    const ctx = createGestureContext(DEFAULT_GEOMETRY, []);
    const state = reduceGesture(createGestureState(ctx), orbit(0, 140), ctx);
    expect(state.view.polarDeg).toBeLessThan(100);
  });
});

describe('one intent per frame', () => {
  test('a stale pointer move cannot override a newer arrow key', () => {
    const ctx = context();
    const seq = createSeqSource();
    let state = createGestureState(ctx);

    const dragStart: GestureInput = { ...orbit(0, 70), seq: seq.next() };
    state = reduceGesture(state, dragStart, ctx);
    const draggedToAzimuth = state.pose.azimuthDeg;

    // The keyboard lands first even though the pointer event was queued before it.
    const keyPress = keyboardStep(YAW_STEP_DEG);
    const keySeq = seq.next();
    state = reduceGesture(state, { ...keyPress, seq: keySeq }, ctx);
    const afterKey = state;

    // The in-flight pointermove is dispatched with the number it got when it left the queue.
    state = reduceGesture(state, { kind: 'orbit', azimuthDeg: -80, polarDeg: 70, source: 'pointer', seq: keySeq - 1 }, ctx);
    expect(state.pose.id).toBe(afterKey.pose.id);
    expect(state.view.azimuthDeg).toBe(afterKey.view.azimuthDeg);
    expect(state.lastIntent).toEqual(afterKey.lastIntent);
    expect(draggedToAzimuth).not.toBe(afterKey.pose.azimuthDeg);

    // A newer pointer event is not stale, and takes the frame.
    const newer = reduceGesture(state, { kind: 'orbit', azimuthDeg: -80, polarDeg: 70, source: 'pointer', seq: seq.next() }, ctx);
    expect(newer.view.azimuthDeg).not.toBe(afterKey.view.azimuthDeg);
  });

  test('two events stamped with the same frame number: first one wins', () => {
    const ctx = context();
    let state = createGestureState(ctx);
    const seq = 42;
    state = reduceGesture(state, { kind: 'orbit', azimuthDeg: 30, polarDeg: 70, source: 'pointer', seq }, ctx);
    const after = state;
    state = reduceGesture(state, { kind: 'orbit', azimuthDeg: -30, polarDeg: 70, source: 'keyboard', seq }, ctx);
    expect(state.view.azimuthDeg).toBe(after.view.azimuthDeg);
    expect(state.revision).toBe(after.revision);
  });

  test('a pinch holds the frame: two fingers down mute single-finger orbit', () => {
    const ctx = context([], DIAL_ONLY);
    let state = createGestureState(ctx);
    const seq = createSeqSource();
    state = reduceGesture(state, { kind: 'pointer_down', pointerId: 1, source: 'touch', seq: seq.next() }, ctx);
    state = reduceGesture(state, { kind: 'pointer_down', pointerId: 2, source: 'touch', seq: seq.next() }, ctx);
    expect(state.pointers).toEqual([1, 2]);

    const muted = reduceGesture(state, { kind: 'orbit', azimuthDeg: 60, polarDeg: 70, source: 'touch', seq: seq.next() }, ctx);
    expect(muted.view.azimuthDeg).toBe(state.view.azimuthDeg);
    expect(muted.lastSeq).toBe(state.lastSeq);

    const zoomed = reduceGesture(muted, { kind: 'zoom', zoom: 1.8, source: 'pinch', seq: seq.next() }, ctx);
    expect(zoomed.view.zoom).toBe(1.8);
    expect(zoomed.activeSource).toBe('pinch');

    const lifted = reduceGesture(zoomed, { kind: 'pointer_up', pointerId: 2, source: 'touch', seq: seq.next() }, ctx);
    expect(lifted.pointers).toEqual([1]);
    const orbitAgain = reduceGesture(lifted, { kind: 'orbit', azimuthDeg: 60, polarDeg: 70, source: 'touch', seq: seq.next() }, ctx);
    expect(orbitAgain.view.azimuthDeg).toBe(60);
  });

  test('a stale pointerup still leaves the registry, or the mute jams forever', () => {
    const ctx = context([], DIAL_ONLY);
    let state = createGestureState(ctx);
    state = reduceGesture(state, { kind: 'pointer_down', pointerId: 7, source: 'touch', seq: 10 }, ctx);
    state = reduceGesture(state, { kind: 'pointer_down', pointerId: 8, source: 'touch', seq: 11 }, ctx);
    state = reduceGesture(state, { kind: 'pointer_up', pointerId: 8, source: 'touch', seq: 3 }, ctx);
    expect(state.pointers).toEqual([7]);
  });
});

describe('poses and announcements in the state', () => {
  test('an arrow step lands on a named pose and carries its disclosure text', () => {
    const ctx = context();
    const start = createGestureState(ctx);
    const state = reduceGesture(start, keyboardStep(YAW_STEP_DEG), ctx);
    expect(state.pose.captions.length).toBeGreaterThan(0);
    expect(state.announcement).toContain('Hairline on the case flank');
    expect(state.announcement).toContain(state.pose.label);
  });

  test('a drag onto an uncaptioned cell changes the view without announcing noise', () => {
    const ctx = context();
    const start = createGestureState(ctx);
    const state = reduceGesture(start, { kind: 'intent', intent: { kind: 'goto_pose', poseId: 'az-090_pol+040' }, source: 'programmatic', seq: next() }, ctx);
    // 9 o'clock at 40 degrees is on the other side of the case from the 2 o'clock hairline.
    expect(state.pose.id).toBe('az-090_pol+040');
    expect(state.pose.captions.length).toBe(0);
    expect(state.announcement).toBeNull();
    expect(state.view.azimuthDeg).toBe(-90);
  });

  test('an unknown pose id is dropped rather than snapped to something nearby', () => {
    const ctx = context();
    const start = createGestureState(ctx);
    const state = reduceGesture(start, { kind: 'intent', intent: { kind: 'goto_pose', poseId: 'az+999_pol+999' }, source: 'programmatic', seq: 5 }, ctx);
    expect(state.view).toEqual(start.view);
    expect(state.pose.id).toBe(start.pose.id);
    expect(state.lastSeq).toBe(5);
    expect(state.revision).toBe(start.revision);
  });

  test('reset returns the framing and the home pose together', () => {
    const ctx = context();
    let state = reduceGesture(createGestureState(ctx), orbit(45, 90), ctx);
    state = reduceGesture(state, { kind: 'zoom', zoom: 2.2, source: 'pinch', seq: next() }, ctx);
    state = reduceGesture(state, { kind: 'intent', intent: { kind: 'reset' }, source: 'keyboard', seq: next() }, ctx);
    expect(state.view.zoom).toBe(1);
    expect(state.pose.id).toBe(ctx.catalogue.homeId);
  });

  test('a zoom that runs past the range is clamped and said as framing', () => {
    const ctx = context();
    let state = createGestureState(ctx);
    state = reduceGesture(state, { kind: 'intent', intent: { kind: 'zoom_step', delta: 50 }, source: 'keyboard', seq: next() }, ctx);
    expect(state.view.zoom).toBe(ctx.bounds.zoomRange[1]);
    expect(state.announcement).toContain('framing');
    expect(state.announcement).not.toContain('o\'clock');
    expect(state.blocked!.axis).toBe('zoom');
  });

  test('a blocked keyboard step says where the photographs end', () => {
    const ctx = context([], { allowedAzimuthRange: [-15, 15], allowedPolarRange: [70, 80] });
    let state = createGestureState(ctx);
    for (let i = 0; i < 8; i += 1) state = reduceGesture(state, keyboardStep(YAW_STEP_DEG), ctx);
    expect(state.blocked).not.toBeNull();
    expect(state.announcement).toContain('edge of the photographs');
    expect(isWithinGeometry(ctx.geometry, state.view, 1e-6)).toBe(true);
  });

  test('the opening state announces nothing, because it is not a change', () => {
    const ctx = context();
    const state = createGestureState(ctx);
    expect(state.announcement).toBeNull();
    expect(state.lastIntent).toBeNull();
    expect(state.revision).toBe(0);
  });
});

describe('purity', () => {
  test('the same input on the same state gives the same state', () => {
    const ctx = context();
    const start = createGestureState(ctx);
    const input = { ...orbit(-60, 88), seq: 99 };
    expect(reduceGesture(start, input, ctx)).toEqual(reduceGesture(start, input, ctx));
  });

  test('reduce does not mutate the state it was handed', () => {
    const ctx = context();
    const start = createGestureState(ctx);
    const before = JSON.stringify(start);
    reduceGesture(start, orbit(-60, 88), ctx);
    expect(JSON.stringify(start)).toBe(before);
  });

  test('sequence numbers are strictly increasing and never reused', () => {
    const seq = createSeqSource(10);
    expect([seq.next(), seq.next(), seq.next()]).toEqual([11, 12, 13]);
  });
});
