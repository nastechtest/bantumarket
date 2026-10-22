import { DEFAULT_ZOOM_RANGE, asPointerLike, clampZoom } from './constrained-orbit.js';
import type { GestureInput } from './gesture-state.js';

/**
 * Pinch zoom (07 §4.1 `controls/`).
 *
 * Two fingers on the item mean "look closer at this", and the only acceptable alternative outcome is
 * the whole document zooming underneath the buyer's hands, which destroys the framing the capture was
 * built to hold. So: `touch-action: none` on the host, non-passive `touchmove` that is cancelled, and
 * the two WebKit gesture events that bypass pointer events entirely.
 *
 * The scale is relative to the span at the moment the second finger landed, never accumulated, so a
 * finger lifting and returning cannot ratchet the zoom.
 */

/** Below this the two fingers are a tap, not a pinch, and the ratio is mostly jitter. */
export const MIN_PINCH_SPAN_PX = 24;

export interface PinchPoint {
  readonly x: number;
  readonly y: number;
}

export function pointerDistance(a: PinchPoint, b: PinchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The whole zoom law, as a pure function: `startZoom` scaled by how much the fingers spread, clamped
 * into the range the capture supports. Clamping here rather than downstream means a caller cannot
 * compute a legal-looking number that the reducer then has to refuse.
 */
export function zoomFromSpans(
  startZoom: number,
  anchorSpan: number,
  span: number,
  zoomRange: readonly [number, number] = DEFAULT_ZOOM_RANGE,
  minSpan: number = MIN_PINCH_SPAN_PX,
): number {
  if (anchorSpan < minSpan || span < minSpan) return clampZoom(zoomRange, startZoom);
  return clampZoom(zoomRange, startZoom * (span / anchorSpan));
}

export type PinchSink = (input: GestureInput) => void;

export interface PinchZoomOptions {
  /** Reads the zoom the gesture started from. A getter, so a keyboard zoom between events is honoured. */
  readonly readZoom: () => number;
  readonly bounds?: { readonly zoomRange: readonly [number, number] };
  readonly onInput: PinchSink;
  readonly seq: () => number;
  readonly source?: 'pinch' | 'touch';
}

export interface PinchZoomHandle {
  activate(): void;
  deactivate(): void;
  /** Exposed for tests and for a host that wants to abort on visibility change. */
  activePointers(): readonly number[];
}

function cancelable(event: Event): void {
  // preventDefault on a passive listener is a no-op with a console warning, which is why the touch
  // listeners below are registered with { passive: false } explicitly.
  if (typeof event.preventDefault === 'function') event.preventDefault();
}

export function attachPinchZoom(host: HTMLElement, options: PinchZoomOptions): PinchZoomHandle {
  const zoomRange = options.bounds?.zoomRange ?? DEFAULT_ZOOM_RANGE;
  const source = options.source ?? 'pinch';
  const points = new Map<number, PinchPoint>();
  let anchorSpan = 0;
  let startZoom = 1;

  const storeTouchAction = host.style.touchAction;
  const spread = (): number | null => {
    if (points.size < 2) return null;
    const [a, b] = [...points.values()];
    if (!a || !b) return null;
    return pointerDistance(a, b);
  };

  const down = (event: Event) => {
    const e = asPointerLike(event);
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.size === 2) {
      anchorSpan = spread() ?? 0;
      startZoom = options.readZoom();
    }
    options.onInput({ kind: 'pointer_down', pointerId: e.pointerId, source, seq: options.seq() });
  };

  const move = (event: Event) => {
    const e = asPointerLike(event);
    if (!points.has(e.pointerId)) return;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const span = spread();
    if (span === null) return;
    // Two fingers on the item are a scale gesture and nothing else; letting the browser page-zoom
    // takes the buyer out of the inspection with no way back except a reload.
    cancelable(event);
    options.onInput({ kind: 'zoom', zoom: zoomFromSpans(startZoom, anchorSpan, span, zoomRange), source, seq: options.seq() });
  };

  const up = (event: Event) => {
    const e = asPointerLike(event);
    if (!points.delete(e.pointerId)) return;
    if (points.size < 2) anchorSpan = 0;
    options.onInput({ kind: 'pointer_up', pointerId: e.pointerId, source, seq: options.seq() });
  };

  const touchMove = (event: Event) => {
    const touches = (event as { readonly touches?: { readonly length: number } }).touches;
    if (touches && touches.length >= 2) cancelable(event);
  };

  const attach = (on: boolean) => {
    const fn = on ? host.addEventListener.bind(host) : host.removeEventListener.bind(host);
    fn('pointerdown', down);
    fn('pointermove', move);
    fn('pointerup', up);
    fn('pointercancel', up);
    if (on) host.style.touchAction = 'none';
    else host.style.touchAction = storeTouchAction;
    fn('touchmove', touchMove);
    // Safari fires gesturestart before any pointer or touch sequence; unhandled, it page-zooms the
    // document out from under the scene.
    fn('gesturestart', cancelable);
    fn('gesturechange', cancelable);
    fn('gestureend', cancelable);
  };

  return {
    activate: () => attach(true),
    deactivate: () => attach(false),
    activePointers: () => [...points.keys()],
  };
}
