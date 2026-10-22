import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { CLAIM_SCOPE_DISCLOSURE, type ClaimScope, type ConditionCaption } from '@nastech/api-contracts'
import { SAFE_DEFAULT_GEOMETRY, createOrbitDrag, type AnglePair, type CaptureGeometry } from './constrained-orbit.js';
import { KEY_HELP, canonicalStops, intentForKey, type CameraIntent, type CameraPose } from './keyboard-rotate.js';
import { attachPinchZoom } from './pinch-zoom.js';
import { createFocusTrap } from './focus-trap.js';
import { blockedText, createAnnouncer } from './screen-reader-announcer.js';
import {
  createGestureContext,
  createGestureState,
  createSeqSource,
  reduceGesture,
  type CameraView,
  type GestureContext,
  type GestureInput,
  type GestureState,
} from './gesture-state.js';

/**
 * React surface (07 §4.1 `controls/`).
 *
 * Everything here is DOM. Nothing in this directory imports the scene runtime, which is what makes
 * rule 1 true rather than aspirational: the provider, the keyboard path and the live region work with
 * no GL context at all, so a buyer on a device that never gets a canvas still has the whole inspection
 * in text and buttons.
 *
 * The provider owns the input host — the element the scene is mounted inside — and attaches drag,
 * pinch, keys and the focus ring there rather than on the canvas, so a WebGL host and a WebGL-less host
 * behave identically up to the point where one of them has pixels.
 */

export interface ControlsProviderProps {
  readonly children: ReactNode;
  /** The capture's recorded range. Omitting it gets the restrictive profile, never a generous one. */
  readonly geometry?: CaptureGeometry;
  readonly captions?: readonly ConditionCaption[];
  readonly claimScope?: ClaimScope;
  readonly zoomRange?: readonly [number, number];
  readonly sceneLabel?: string;
  /** Announce debounce, in ms. */
  readonly announceDelayMs?: number;
  /** The scene bridge: called when the named pose changes, so the camera can follow the state. */
  readonly onPoseChange?: (pose: CameraPose, view: CameraView) => void;
}

interface ControlsApi {
  readonly state: GestureState;
  readonly ctx: GestureContext;
  readonly dispatch: (input: GestureInput) => void;
  readonly setPose: (poseId: string) => void;
  /** The provider's own sequence counter: every input must come from it, or staleness is meaningless. */
  readonly nextSeq: () => number;
  readonly setLiveRegion: (region: HTMLElement | null) => void;
  readonly poseStops: readonly CameraPose[];
}

const ControlsContext = createContext<ControlsApi | null>(null);

function useControlsApi(where: string): ControlsApi {
  const api = useContext(ControlsContext);
  if (!api) throw new Error(`${where} must be used inside <ControlsProvider>.`);
  return api;
}

/** The public surface the brief names. Deliberately four fields; the rest is wiring. */
export interface Controls {
  readonly pose: CameraPose;
  readonly setPose: (poseId: string) => void;
  readonly bounds: GestureState['bounds'];
  readonly announcement: string | null;
}

export function useControls(): Controls {
  const { state, setPose } = useControlsApi('useControls()');
  return { pose: state.pose, setPose, bounds: state.bounds, announcement: state.announcement };
}

/** Wiring behind the four fields, exported so an app can build its own surface on the same state. */
export function useViewerControlsApi(): ControlsApi {
  return useControlsApi('useViewerControlsApi()');
}

const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: '0',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: '0',
};

export function ControlsProvider(props: ControlsProviderProps) {
  const geometry = props.geometry ?? SAFE_DEFAULT_GEOMETRY;
  const captions = props.captions ?? [];
  const claimScope = props.claimScope ?? 'geometry_and_external_condition';
  const sceneLabel = props.sceneLabel ?? 'Watch inspection';
  const announceDelayMs = props.announceDelayMs ?? 220;
  const onPoseChange = props.onPoseChange;

  const ctx = useMemo(
    () =>
      createGestureContext(geometry, captions, {
        // Only present when the viewer actually set it: an absent framing range means the capture's
        // default, while an explicit `undefined` is a different type under exactOptionalPropertyTypes.
        ...(props.zoomRange ? { zoomRange: props.zoomRange } : {}),
        claimScope,
      }),
    [geometry, captions, props.zoomRange, claimScope],
  );

  const [state, dispatch] = useReducer(
    (s: GestureState, input: GestureInput) => reduceGesture(s, input, ctx),
    ctx,
    (initial) => createGestureState(initial),
  );

  const seq = useMemo(() => createSeqSource(), []);
  const announcer = useMemo(() => createAnnouncer({ delayMs: announceDelayMs }), [announceDelayMs]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [host, setHost] = useState<HTMLElement | null>(null);

  const setPose = useCallback(
    (poseId: string) => dispatch({ kind: 'intent', intent: { kind: 'goto_pose', poseId }, source: 'programmatic', seq: seq.next() }),
    [dispatch, seq],
  );

  const setLiveRegion = useCallback(
    (region: HTMLElement | null) => {
      announcer.setLiveRegion(region);
    },
    [announcer],
  );

  const readAngles = useCallback((): AnglePair => {
    const { azimuthDeg, polarDeg } = stateRef.current.view;
    return { azimuthDeg, polarDeg };
  }, []);
  const readZoom = useCallback(() => stateRef.current.view.zoom, []);

  // The input adapters, attached once per host element, all feeding the one reducer.
  useEffect(() => {
    if (!host) return;
    const pinch = attachPinchZoom(host, { readZoom, bounds: ctx.bounds, onInput: dispatch, seq: () => seq.next() });
    const drag = createOrbitDrag(host, {
      readAngles,
      geometry: ctx.geometry,
      onInput: ({ azimuthDeg, polarDeg }) => dispatch({ kind: 'orbit', azimuthDeg, polarDeg, source: 'pointer', seq: seq.next() }),
    });
    const trap = createFocusTrap(host, { onLeave: () => announcer.cancel() });
    pinch.activate();
    drag.activate();
    trap.activate();
    return () => {
      pinch.deactivate();
      drag.deactivate();
      trap.deactivate();
    };
  }, [host, ctx, dispatch, readAngles, readZoom, seq, announcer]);

  useEffect(() => {
    announcer.announce(state.announcement);
  }, [announcer, state.announcement, state.revision]);

  // Whatever was debounced when the viewer went away is said on the way out, not lost: a buyer who
  // taps past the last caption should still hear it.
  useEffect(() => () => announcer.flush(), [announcer]);

  useEffect(() => {
    onPoseChange?.(state.pose, state.view);
  }, [onPoseChange, state.pose, state.view]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const intent = intentForKey(event.key);
      if (!intent) return;
      // Only mapped keys are taken; Escape is left to the focus trap so leaving stays possible.
      event.preventDefault();
      dispatch({ kind: 'intent', intent, source: 'keyboard', seq: seq.next() });
    },
    [dispatch, seq],
  );

  const poseStops = useMemo(
    () => (ctx.catalogue.captioned ? ctx.catalogue.tour : canonicalStops(ctx.catalogue, ctx.geometry)),
    [ctx],
  );

  const nextSeq = useCallback(() => seq.next(), [seq]);

  const api = useMemo<ControlsApi>(
    () => ({ state, ctx, dispatch, setPose, nextSeq, setLiveRegion, poseStops }),
    [state, ctx, dispatch, setPose, nextSeq, setLiveRegion, poseStops],
  );

  return (
    <ControlsContext.Provider value={api}>
      <div
        data-role="viewer-host"
        ref={setHost}
        role="group"
        aria-label={sceneLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        style={{ position: 'relative', width: '100%', touchAction: 'none' }}
      >
        {props.children}
        <ViewerControls sceneLabel={sceneLabel} claimScope={claimScope} />
      </div>
    </ControlsContext.Provider>
  );
}

export interface ViewerControlsProps {
  readonly sceneLabel?: string;
  readonly claimScope?: ClaimScope;
}

/**
 * The buttons and the live region. Two things this render is accountable for: every caption the
 * capture carries is reachable by a key press or a real button, and the visible line of text is the
 * same text a screen reader is told — there is no version of this inspection only a mouse can read.
 */
export function ViewerControls({ sceneLabel = 'Watch inspection', claimScope = 'geometry_and_external_condition' }: ViewerControlsProps) {
  const { state, ctx, dispatch, nextSeq, setLiveRegion, setPose, poseStops } = useViewerControlsApi();
  const helpId = `${sceneLabel.replace(/\s+/g, '-').toLowerCase()}-keys`;
  const send = (intent: CameraIntent) => dispatch({ kind: 'intent', intent, source: 'programmatic', seq: nextSeq() });
  const step = (yawDeg: number, pitchDeg: number) => send({ kind: 'orbit_step', yawDeg, pitchDeg });
  const zoomBy = (delta: number) => send({ kind: 'zoom_step', delta });

  return (
    <div role="group" aria-label={`${sceneLabel} controls`} aria-describedby={helpId} style={{ display: 'grid', gap: 'var(--ns-space-2, 8px)' }}>
      {/* One node holds the visible line and the announced line, so they cannot drift apart. */}
      <p data-role="announcement" role="status" aria-live="polite" ref={setLiveRegion} style={{ margin: 0, minHeight: '1.4em' }}>
        {state.pose.label}
      </p>

      <div role="group" aria-label="Condition viewpoints" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ns-space-1, 4px)' }}>
        {poseStops.map((pose) => (
          <button
            key={pose.id}
            type="button"
            onClick={() => setPose(pose.id)}
            aria-pressed={state.pose.id === pose.id}
            aria-label={pose.captions.length > 0 ? `${pose.label}, ${pose.captions.length} condition ${pose.captions.length === 1 ? 'note' : 'notes'}` : pose.label}
            data-hotspot-ids={pose.hotspotIds.length > 0 ? pose.hotspotIds.join(' ') : undefined}
          >
            {pose.label}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Camera" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ns-space-1, 4px)' }}>
        <button type="button" onClick={() => step(-15, 0)}>
          Orbit left
        </button>
        <button type="button" onClick={() => step(15, 0)}>
          Orbit right
        </button>
        <button type="button" onClick={() => step(0, -10)}>
          Tilt up
        </button>
        <button type="button" onClick={() => step(0, 10)}>
          Tilt down
        </button>
        <button type="button" onClick={() => zoomBy(0.25)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(-0.25)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => send({ kind: 'reset' })}>
          Reset view
        </button>
      </div>

      {state.blocked ? (
        <p data-role="capture-limit" style={{ margin: 0 }}>
          {blockedText(state.blocked)}
        </p>
      ) : null}

      {/* A hotspot the clamp cannot reach is a capture defect. Naming it here turns it into a ticket
          instead of a blind spot in the condition story. */}
      {ctx.catalogue.unreachableCaptions.length > 0 ? (
        <p data-role="unreachable" style={{ margin: 0 }}>
          {ctx.catalogue.unreachableCaptions.length} condition note
          {ctx.catalogue.unreachableCaptions.length === 1 ? '' : 's'} in this listing cannot be shown from this capture.
        </p>
      ) : null}

      <ul id={helpId} style={VISUALLY_HIDDEN}>
        {KEY_HELP.map((entry) => (
          <li key={entry.key}>
            {entry.key}: {entry.says}
          </li>
        ))}
      </ul>

      <p data-role="claim-scope" style={{ margin: 0 }}>
        {CLAIM_SCOPE_DISCLOSURE[claimScope]}
      </p>
    </div>
  );
}
