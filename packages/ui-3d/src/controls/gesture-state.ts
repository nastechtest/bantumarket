import type { ClaimScope, ConditionCaption } from '@nastech/api-contracts'
import {
  DEFAULT_ZOOM_RANGE,
  SAFE_DEFAULT_GEOMETRY,
  clampAngles,
  clampZoom,
  validateGeometry,
  type AnglePair,
  type CaptureGeometry,
  type OrbitBounds,
} from './constrained-orbit.js';
import {
  YAW_STEP_DEG,
  PITCH_STEP_DEG,
  advancePose,
  buildPoseCatalogue,
  nearestPose,
  type CameraIntent,
  type CameraPose,
  type PoseCatalogue,
} from './keyboard-rotate.js';
import { announcementForPose, framingText, blockedText, type AnnouncementContext } from './screen-reader-announcer.js';

/**
 * Gesture state (07 §4.1 `controls/`).
 *
 * One reducer owns the camera. A mouse drag, a two-finger pinch, an arrow key and a scene that damped
 * past its limit all arrive here as separate events, and the frame can only ever carry one resolved
 * intent — otherwise the drag and the pinch write the same fields from different callbacks and the
 * buyer watches the item jitter while they are deciding whether the bezel is scratched.
 *
 * Two rules the tests exist to keep:
 *  - an event whose sequence number is not newer than the last applied one cannot change the view;
 *  - every angle leaving this reducer has been through `clampAngles`, so an unrecorded view is not
 *    reachable by any input, including an input that does not know about the limit.
 */

export type InputSource = 'pointer' | 'touch' | 'pinch' | 'keyboard' | 'scene' | 'programmatic';

export type GestureInput =
  | { readonly kind: 'pointer_down'; readonly pointerId: number; readonly source: InputSource; readonly seq: number }
  | { readonly kind: 'pointer_up'; readonly pointerId: number; readonly source: InputSource; readonly seq: number }
  | { readonly kind: 'orbit'; readonly azimuthDeg: number; readonly polarDeg: number; readonly source: InputSource; readonly seq: number }
  | { readonly kind: 'zoom'; readonly zoom: number; readonly source: InputSource; readonly seq: number }
  | { readonly kind: 'intent'; readonly intent: CameraIntent; readonly source: InputSource; readonly seq: number };

export interface CameraView {
  readonly azimuthDeg: number;
  readonly polarDeg: number;
  /** Framing scale: 1 is the capture's default framing, larger is closer to the item. */
  readonly zoom: number;
}

export interface BlockNotice {
  readonly axis: 'azimuth' | 'polar' | 'zoom';
  readonly direction: -1 | 1;
}

export interface GestureState {
  readonly bounds: OrbitBounds;
  readonly view: CameraView;
  /** The named pose the view resolves to. Always inside the recorded geometry. */
  readonly pose: CameraPose;
  /** Null when this change has nothing to say; the live region then stays empty by design. */
  readonly announcement: string | null;
  readonly lastIntent: CameraIntent | null;
  readonly activeSource: InputSource;
  readonly lastSeq: number;
  readonly pointers: readonly number[];
  readonly blocked: BlockNotice | null;
  /** Monotonic per applied change — the scene loop uses it to skip redundant renders. */
  readonly revision: number;
}

export interface GestureContext {
  readonly catalogue: PoseCatalogue;
  readonly bounds: OrbitBounds;
  readonly geometry: CaptureGeometry;
  readonly announce: AnnouncementContext;
}

export interface CreateContextOptions {
  readonly zoomRange?: readonly [number, number];
  readonly claimScope?: ClaimScope;
  readonly yawStepDeg?: number;
  readonly pitchStepDeg?: number;
}

export function createGestureContext(
  geometry: CaptureGeometry,
  captions: readonly ConditionCaption[],
  options: CreateContextOptions = {},
): GestureContext {
  const g = validateGeometry(geometry);
  const zoomRange = options.zoomRange ?? DEFAULT_ZOOM_RANGE;
  const bounds: OrbitBounds = { allowedAzimuthRange: g.allowedAzimuthRange, allowedPolarRange: g.allowedPolarRange, zoomRange };
  const catalogue = buildPoseCatalogue(g, captions, {
    yawStepDeg: options.yawStepDeg ?? YAW_STEP_DEG,
    pitchStepDeg: options.pitchStepDeg ?? PITCH_STEP_DEG,
  });
  return {
    catalogue,
    bounds,
    geometry: g,
    announce: { captioned: catalogue.captioned, claimScope: options.claimScope ?? 'geometry_and_external_condition' },
  };
}

export function createGestureState(
  ctx: GestureContext,
  initialAngles: AnglePair = { azimuthDeg: 0, polarDeg: 75 },
  initialZoom = 1,
): GestureState {
  const angles = clampAngles(ctx.geometry, initialAngles);
  const pose = nearestPose(ctx.catalogue, angles);
  return {
    bounds: ctx.bounds,
    view: { azimuthDeg: angles.azimuthDeg, polarDeg: angles.polarDeg, zoom: clampZoom(ctx.bounds.zoomRange, initialZoom) },
    pose,
    // The opening pose is not a change, so it is not announced: a live region that speaks on mount
    // talks over whatever the page was already saying about the item.
    announcement: null,
    lastIntent: null,
    activeSource: 'programmatic',
    lastSeq: 0,
    pointers: [],
    blocked: null,
    revision: 0,
  };
}

/** The safe profile, exported so a caller with no capture record cannot invent a permissive one. */
export const DEFAULT_GEOMETRY: CaptureGeometry = SAFE_DEFAULT_GEOMETRY;

function axesBlocked(requested: AnglePair, clamped: AnglePair): BlockNotice | null {
  const azDelta = requested.azimuthDeg - clamped.azimuthDeg;
  const polDelta = requested.polarDeg - clamped.polarDeg;
  if (Math.abs(polDelta) > 1e-6) return { axis: 'polar', direction: polDelta > 0 ? 1 : -1 };
  if (Math.abs(azDelta) > 1e-6) return { axis: 'azimuth', direction: azDelta > 0 ? 1 : -1 };
  return null;
}

function withPose(state: GestureState, view: CameraView, pose: CameraPose, ctx: GestureContext, intent: CameraIntent, source: InputSource, seq: number, blocked: BlockNotice | null): GestureState {
  const announcement =
    intent.kind === 'zoom' || intent.kind === 'zoom_step' ? framingText(view.zoom) : announcementForPose(pose, ctx.announce);
  return {
    ...state,
    view,
    pose,
    announcement,
    lastIntent: intent,
    activeSource: source,
    lastSeq: seq,
    blocked,
    revision: state.revision + 1,
  };
}

function applyIntent(intent: CameraIntent, state: GestureState, ctx: GestureContext, source: InputSource, seq: number): GestureState {
  const { geometry, catalogue, bounds } = ctx;

  switch (intent.kind) {
    case 'orbit': {
      const requested: AnglePair = { azimuthDeg: intent.azimuthDeg, polarDeg: intent.polarDeg };
      const angles = clampAngles(geometry, requested);
      const pose = nearestPose(catalogue, angles);
      return withPose(state, { azimuthDeg: angles.azimuthDeg, polarDeg: angles.polarDeg, zoom: state.view.zoom }, pose, ctx, intent, source, seq, axesBlocked(requested, angles));
    }
    case 'orbit_step': {
      const step = { yawDeg: intent.yawDeg, pitchDeg: intent.pitchDeg };
      const moved = advancePose(catalogue, state.pose, step);
      if (moved.blocked) {
        const axis = step.pitchDeg !== 0 ? 'polar' : 'azimuth';
        const direction = (step.pitchDeg !== 0 ? step.pitchDeg : step.yawDeg) > 0 ? 1 : -1;
        // Refusing the step but still counting it: the notice has to reach the live region, and the
        // next event must still win the sequence race against this one.
        return {
          ...state,
          announcement: blockedText({ axis, direction }),
          lastIntent: intent,
          activeSource: source,
          lastSeq: seq,
          blocked: { axis, direction },
          revision: state.revision + 1,
        };
      }
      const pose = moved.pose;
      const angles = clampAngles(geometry, { azimuthDeg: pose.azimuthDeg, polarDeg: pose.polarDeg });
      return withPose(state, { azimuthDeg: angles.azimuthDeg, polarDeg: angles.polarDeg, zoom: state.view.zoom }, pose, ctx, intent, source, seq, null);
    }
    case 'zoom':
    case 'zoom_step': {
      const requested = intent.kind === 'zoom' ? intent.zoom : state.view.zoom + intent.delta;
      const zoom = clampZoom(bounds.zoomRange, requested);
      const blocked: BlockNotice | null =
        Math.abs(zoom - requested) > 1e-6 ? { axis: 'zoom', direction: requested > zoom ? 1 : -1 } : null;
      return withPose(state, { ...state.view, zoom }, state.pose, ctx, intent, source, seq, blocked);
    }
    case 'goto_pose': {
      const pose = catalogue.poses.find((p) => p.id === intent.poseId);
      // An unknown pose id is a UI referencing a view this capture does not have. Dropping it is the
      // only safe answer; snapping it to the nearest real pose would move the camera unasked.
      if (!pose) return { ...state, lastSeq: seq, activeSource: source };
      const angles = clampAngles(geometry, { azimuthDeg: pose.azimuthDeg, polarDeg: pose.polarDeg });
      return withPose(state, { azimuthDeg: angles.azimuthDeg, polarDeg: angles.polarDeg, zoom: state.view.zoom }, pose, ctx, intent, source, seq, null);
    }
    case 'reset': {
      const home = catalogue.poses.find((p) => p.id === catalogue.homeId) ?? nearestPose(catalogue, { azimuthDeg: 0, polarDeg: 75 });
      const angles = clampAngles(geometry, { azimuthDeg: home.azimuthDeg, polarDeg: home.polarDeg });
      const zoom = clampZoom(bounds.zoomRange, 1);
      return withPose(state, { azimuthDeg: angles.azimuthDeg, polarDeg: angles.polarDeg, zoom }, home, ctx, intent, source, seq, null);
    }
  }
}

/**
 * The single funnel. Pure: no clock, no random, no DOM, so the tests can drive it with a synthetic
 * event stream and get the same answers the app does.
 */
export function reduceGesture(state: GestureState, input: GestureInput, ctx: GestureContext): GestureState {
  if (input.kind === 'pointer_down') {
    // Pointer membership is tracked even for a stale event: dropping it would leak an id into
    // `pointers` and permanently jam the two-finger rule below.
    if (state.pointers.includes(input.pointerId)) return { ...state, lastSeq: Math.max(state.lastSeq, input.seq) };
    return { ...state, pointers: [...state.pointers, input.pointerId], lastSeq: Math.max(state.lastSeq, input.seq) };
  }
  if (input.kind === 'pointer_up') {
    return { ...state, pointers: state.pointers.filter((id) => id !== input.pointerId), lastSeq: Math.max(state.lastSeq, input.seq) };
  }

  const stale = input.seq <= state.lastSeq;
  const twoFinger = state.pointers.length >= 2;
  if (stale) return state;
  // While a second finger is down the frame belongs to the pinch. A palm brushing the screen during
  // a zoom must not spin the item around.
  if (twoFinger && input.kind === 'orbit' && (input.source === 'pointer' || input.source === 'touch')) return state;

  return applyIntent(input.kind === 'intent' ? input.intent : intentOf(input), state, ctx, input.source, input.seq);
}

/** Direct inputs are the same intents under another name; keeping one resolver is the point. */
function intentOf(input: GestureInput): CameraIntent {
  if (input.kind === 'orbit') return { kind: 'orbit', azimuthDeg: input.azimuthDeg, polarDeg: input.polarDeg };
  if (input.kind === 'zoom') return { kind: 'zoom', zoom: input.zoom };
  return { kind: 'reset' };
}

/**
 * Monotonic sequence source, created at the edge where real events arrive. The number is taken when
 * the event is *dispatched*, not when it is handled — that is what makes a queued pointermove lose
 * to an arrow key pressed after it, which is the whole staleness rule.
 */
export function createSeqSource(start = 0): { next(): number } {
  let value = start;
  return { next: () => (value += 1) };
}
