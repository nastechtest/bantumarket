const bunTestSpecifier = 'bun:test';
const bunTest = await import(bunTestSpecifier);
const { describe, test } = bunTest as {
  describe: (name: string, fn: () => void) => void;
  test: (name: string, fn: () => void | Promise<void>) => void;
};
/** `bun:test` ships no declarations in this workspace, and naming every matcher in a cast is how a
 *  test file stops compiling before it stops passing. The matcher object stays dynamic. */
const expect = bunTest.expect;

const jsdomSpecifier = 'jsdom';
const { JSDOM } = (await import(jsdomSpecifier)) as { JSDOM: new (html: string) => { window: Window & typeof globalThis } };
const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event });

import { DEFAULT_ZOOM_RANGE, clampZoom } from './constrained-orbit.js';
import { MIN_PINCH_SPAN_PX, attachPinchZoom, pointerDistance, zoomFromSpans, type PinchPoint } from './pinch-zoom.js';
import { createGestureContext, createGestureState, reduceGesture, type GestureInput } from './gesture-state.js';

interface Recording {
  readonly inputs: GestureInput[];
  readonly seqs: number[];
}

function pointerEvent(host: HTMLElement, type: string, init: { pointerId: number; x: number; y: number; pointerType?: string; button?: number }): Event {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: init.pointerId,
    clientX: init.x,
    clientY: init.y,
    pointerType: init.pointerType ?? 'touch',
    button: init.button ?? 0,
  });
  host.dispatchEvent(event);
  return event;
}

function harness(startZoom = 1) {
  const host = dom.window.document.createElement('div');
  const recording: Recording = { inputs: [], seqs: [] };
  let local = 0;
  const handle = attachPinchZoom(host, {
    readZoom: () => startZoom,
    bounds: { zoomRange: DEFAULT_ZOOM_RANGE },
    onInput: (input) => recording.inputs.push(input),
    seq: () => {
      local += 1;
      recording.seqs.push(local);
      return local;
    },
  });
  const zoomInputs = () => recording.inputs.filter((i) => i.kind === 'zoom') as Extract<GestureInput, { kind: 'zoom' }>[];
  return { host, recording, handle, zoomInputs };
}

describe('scale law', () => {
  test('spreading the fingers magnifies proportionally', () => {
    expect(zoomFromSpans(1, 100, 200, [0.5, 3])).toBe(2);
    expect(zoomFromSpans(2, 100, 50, [0.5, 3])).toBe(1);
  });

  test('the range is absolute, in both directions', () => {
    expect(zoomFromSpans(1, 100, 100000, DEFAULT_ZOOM_RANGE)).toBe(DEFAULT_ZOOM_RANGE[1]);
    expect(zoomFromSpans(1, 100, 1, DEFAULT_ZOOM_RANGE)).toBe(1);
    expect(zoomFromSpans(2.3, 120, 4, DEFAULT_ZOOM_RANGE)).toBe(2.3);
  });

  test('a pinch below the jitter floor does not move the zoom at all', () => {
    for (let span = 0; span < MIN_PINCH_SPAN_PX; span += 5) {
      expect(zoomFromSpans(1, 30, span, DEFAULT_ZOOM_RANGE)).toBe(clampZoom(DEFAULT_ZOOM_RANGE, 1));
    }
    expect(zoomFromSpans(1, 6, 12, DEFAULT_ZOOM_RANGE)).toBe(1);
  });

  test('distance is symmetric, because fingers do not have an order', () => {
    const a: PinchPoint = { x: 10, y: 20 };
    const b: PinchPoint = { x: 40, y: 60 };
    expect(pointerDistance(a, b)).toBe(pointerDistance(b, a));
    expect(pointerDistance(a, b)).toBe(50);
  });
});

describe('host behaviour', () => {
  test('activating sets touch-action none and deactivating restores what was there', () => {
    const host = dom.window.document.createElement('div');
    host.style.touchAction = 'pan-y';
    const handle = attachPinchZoom(host, { readZoom: () => 1, onInput: () => undefined, seq: () => 1 });
    handle.activate();
    expect(host.style.touchAction).toBe('none');
    handle.deactivate();
    expect(host.style.touchAction).toBe('pan-y');
  });

  test('two fingers become a zoom intent and never a page zoom', () => {
    const { host, handle, recording, zoomInputs } = harness(1);
    handle.activate();
    pointerEvent(host, 'pointerdown', { pointerId: 1, x: 0, y: 0 });
    const moveAlone = pointerEvent(host, 'pointermove', { pointerId: 1, x: 50, y: 0 });
    expect(moveAlone.defaultPrevented).toBe(false);
    expect(zoomInputs().length).toBe(0);

    // The anchor is the span when the second finger lands, wherever the first one happened to get to.
    pointerEvent(host, 'pointerdown', { pointerId: 2, x: 150, y: 0 });
    expect(handle.activePointers()).toEqual([1, 2]);
    const spread = pointerEvent(host, 'pointermove', { pointerId: 2, x: 250, y: 0 });
    expect(spread.defaultPrevented).toBe(true);
    const zooms = zoomInputs();
    expect(zooms.length).toBe(1);
    expect(zooms[0]!.zoom).toBeCloseTo(2, 6);
    pointerEvent(host, 'pointermove', { pointerId: 2, x: 900, y: 0 });
    expect(zoomInputs()[zoomInputs().length - 1]!.zoom).toBe(DEFAULT_ZOOM_RANGE[1]);
    expect(recording.inputs.filter((i) => i.kind === 'pointer_down').length).toBe(2);
    handle.deactivate();
  });

  test('sequence numbers rise with the events, which is what makes a stale move lose', () => {
    const { host, handle, recording } = harness(1);
    handle.activate();
    pointerEvent(host, 'pointerdown', { pointerId: 1, x: 0, y: 0 });
    pointerEvent(host, 'pointerdown', { pointerId: 2, x: 100, y: 0 });
    pointerEvent(host, 'pointermove', { pointerId: 2, x: 150, y: 0 });
    const seqs = recording.inputs.map((i) => i.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    handle.deactivate();
  });

  test('lifting a finger ends the pinch instead of ratcheting it', () => {
    const { host, handle, zoomInputs } = harness(1);
    handle.activate();
    pointerEvent(host, 'pointerdown', { pointerId: 1, x: 0, y: 0 });
    pointerEvent(host, 'pointerdown', { pointerId: 2, x: 100, y: 0 });
    pointerEvent(host, 'pointermove', { pointerId: 2, x: 300, y: 0 });
    pointerEvent(host, 'pointerup', { pointerId: 2, x: 300, y: 0 });
    expect(handle.activePointers()).toEqual([1]);
    const before = zoomInputs().length;
    pointerEvent(host, 'pointermove', { pointerId: 1, x: 300, y: 300 });
    expect(zoomInputs().length).toBe(before);
    pointerEvent(host, 'pointerup', { pointerId: 1, x: 300, y: 300 });
    expect(handle.activePointers()).toEqual([]);
    handle.deactivate();
  });

  test('a cancelled finger leaves the registry too', () => {
    const { host, handle } = harness(1);
    handle.activate();
    pointerEvent(host, 'pointerdown', { pointerId: 4, x: 0, y: 0 });
    pointerEvent(host, 'pointercancel', { pointerId: 4, x: 0, y: 0 });
    expect(handle.activePointers()).toEqual([]);
    handle.deactivate();
  });

  test('WebKit gesture events are cancelled before they can page-zoom the document', () => {
    const { host, handle } = harness(1);
    handle.activate();
    for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'touchmove']) {
      const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { touches: { length: 2 } });
      host.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    handle.deactivate();
  });

  test('a single touchmove is left alone, so the page can still be scrolled past the viewer', () => {
    const { host, handle } = harness(1);
    handle.activate();
    const event = new dom.window.Event('touchmove', { bubbles: true, cancelable: true });
    Object.assign(event, { touches: { length: 1 } });
    host.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    handle.deactivate();
  });
});

describe('pinch through the reducer', () => {
  test('an enormous spread still cannot leave the zoom range', () => {
    const ctx = createGestureContext({ allowedAzimuthRange: [-45, 45], allowedPolarRange: [40, 95] }, []);
    let state = createGestureState(ctx);
    const inputs: GestureInput[] = [
      { kind: 'pointer_down', pointerId: 1, source: 'touch', seq: 1 },
      { kind: 'pointer_down', pointerId: 2, source: 'touch', seq: 2 },
      // The adapter already clamps, so this is a raw number from a caller that did not.
      { kind: 'zoom', zoom: zoomFromSpans(1, 60, 6000, ctx.bounds.zoomRange), source: 'pinch', seq: 3 },
      { kind: 'zoom', zoom: 40, source: 'programmatic', seq: 4 },
    ];
    for (const input of inputs) state = reduceGesture(state, input, ctx);
    expect(state.view.zoom).toBe(ctx.bounds.zoomRange[1]);
    expect(state.blocked!.axis).toBe('zoom');
  });
});
