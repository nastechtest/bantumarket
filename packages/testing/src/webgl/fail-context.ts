import { installDom } from '../dom/env.js';
import type { FakeWebGLContext } from './context.js';
import { installWebGLStub, type WebGLStubHandle } from './stub.js';

/**
 * The three failures the product cannot tolerate, reproducible in one call each.
 *
 * `packages/ui-3d/src/viewer/context-loss.ts` models the machine (`idle → live → lost`,
 * `idle → refused`), and `canvas-host.tsx` listens for `webglcontextlost` on the canvas R3F mounted.
 * Neither can be driven from jsdom without help, because jsdom has no GL and therefore never fires
 * the event. Today that help is hand-rolled per package (`viewer/tests/dom-env.ts`,
 * `fallback/test-dom.ts`, and two `skip()`ed cases in `viewer/tests/canvas-render.browser.test.tsx`).
 * This module is the shared version: it synthesises the DOM-level signals a real driver sends, so a
 * viewer or app test can assert behaviour rather than existence.
 *
 * Three facts a hand-rolled fake usually gets wrong, and this file deliberately does not:
 *  1. `webglcontextlost` is CANCELABLE. A restore is only permitted if a handler called
 *     `preventDefault()`; `dispatchContextLost` reports that back instead of swallowing it.
 *  2. A lost context answers `getParameter` and `getExtension` with null until it is restored — the
 *     shape the byte accounting and the tracker depend on. One event, one state flip, never two.
 *  3. `getContext('webgl2')` returning null is a DIFFERENT failure from a context that dies
 *     mid-session. The first is a capability refusal (choose static before fetching a byte); the
 *     second is a loss (swap to static, stay there — ADR 0003 says loss is terminal). Collapsing them
 *     is how a suite goes green while production stays wrong, so they are separate functions.
 */

export type ContextLossReason = 'gpu-pressure' | 'driver-reset' | 'tab-hidden' | 'manual';

export interface LostContextResult {
  readonly type: 'webglcontextlost';
  readonly reason: ContextLossReason;
  /**
   * True when a listener called `preventDefault()`, i.e. the app asked for the option of restoring.
   * `canvas-host.tsx` does exactly that, so a test asserting the opposite found a real bug.
   */
  readonly restoredAllowed: boolean;
  /** The fake context the canvas had, if any — `null` on the capability-refusal path. */
  readonly context: FakeWebGLContext | null;
}

export interface RestoredContextResult {
  readonly type: 'webglcontextrestored';
  readonly context: FakeWebGLContext | null;
  /** `webglcontextrestored` is not cancelable; false always, kept so the shape matches `lose`. */
  readonly defaultPrevented: false;
}

export interface DispatchOptions {
  readonly reason?: ContextLossReason;
  /** Registered as a listener BEFORE dispatch, so a test can observe the same event the component sees. */
  readonly onLost?: (event: Event) => void;
}

/**
 * The one portable lookup for "the context this canvas was handed", and it deliberately does not go
 * through `getContext`: asking a canvas for its context is itself a GL call, and the most valuable
 * assertion in this product is that the static path made none.
 */
function attachedContext(canvas: HTMLCanvasElement): FakeWebGLContext | null {
  const attached = (canvas as unknown as { __nastechGlContext?: FakeWebGLContext }).__nastechGlContext;
  return attached ?? null;
}

function dispatch(
  canvas: HTMLCanvasElement,
  type: 'webglcontextlost' | 'webglcontextrestored',
  reason: ContextLossReason,
): boolean {
  const dom = installDom();
  const event = new dom.window.Event(type, { bubbles: false, cancelable: type === 'webglcontextlost' });
  Object.assign(event as unknown as Record<string, unknown>, { statusMessage: reason });
  canvas.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * Fire `webglcontextlost` on the canvas and mark its stub context dead in the same step.
 *
 * Returns `restoredAllowed: false` when nothing prevented the default, which is the browser's signal
 * that the context is gone for good — the terminal `lost` edge the tracker models.
 */
export function dispatchContextLost(
  canvas: HTMLCanvasElement,
  options: DispatchOptions = {},
): LostContextResult {
  const reason = options.reason ?? 'manual';
  if (options.onLost !== undefined) canvas.addEventListener('webglcontextlost', options.onLost, false);
  const context = attachedContext(canvas);
  const restoredAllowed = dispatch(canvas, 'webglcontextlost', reason);
  context?.setLost(true);
  return { type: 'webglcontextlost', reason, restoredAllowed, context };
}

/**
 * Fire `webglcontextrestored`. Refuses when the canvas was never lost, because a fake that allowed it
 * would let a test "restore" a context that never died and conclude the app handles restoration.
 */
export function dispatchContextRestored(
  canvas: HTMLCanvasElement,
  options: DispatchOptions = {},
): RestoredContextResult {
  const context = attachedContext(canvas);
  if (context === null || !context.internalState().lost) {
    throw new Error(
      '[testing/webgl] webglcontextrestored dispatched on a canvas with no lost context. ' +
        'Call dispatchContextLost() first, or use withoutWebgl2() for the capability-refusal case.',
    );
  }
  const reason = options.reason ?? 'manual';
  dispatch(canvas, 'webglcontextrestored', reason);
  context.setLost(false);
  return { type: 'webglcontextrestored', context, defaultPrevented: false };
}

/**
 * Make `getContext('webgl2' | 'webgl' | 'experimental-webgl')` answer null for the duration of `run`.
 * This is the capability-refusal path: the app must choose the static render before a byte is
 * fetched, so those tests need the probe to say "no GL here", not "GL died later".
 */
export function withoutWebgl2<T>(run: () => T): T {
  const stub = installWebGLStub({ mode: 'none' });
  try {
    return run();
  } finally {
    stub.restore();
  }
}

/**
 * A scenario handle for the viewer-level test that wants "mounted, then died, and the app must never
 * mount a canvas again": a canvas the product's listeners can attach to, plus the scripted sequence.
 */
export interface ContextFailureScript {
  readonly canvas: HTMLCanvasElement;
  readonly stub: WebGLStubHandle;
  readonly context: FakeWebGLContext | null;
  lostCount(): number;
  restoredCount(): number;
  lose(options?: DispatchOptions): LostContextResult;
  restore(options?: DispatchOptions): RestoredContextResult;
  /** The ordered event names actually dispatched — the audit trail a state-machine test asserts on. */
  sequence(): readonly string[];
  dispose(): void;
}

export function createContextFailure(defaultReason: ContextLossReason = 'gpu-pressure'): ContextFailureScript {
  const dom = installDom();
  const stub = installWebGLStub({ mode: 'webgl2' });
  const canvas = dom.document.createElement('canvas');
  canvas.setAttribute('aria-label', '3D inspection');
  canvas.setAttribute('role', 'group');
  dom.document.body.appendChild(canvas);
  // Create the context the way the component would (through getContext), then never ask again.
  const context = canvas.getContext('webgl2') as FakeWebGLContext | null;

  const events: string[] = [];
  let lost = 0;
  let restored = 0;

  return {
    canvas,
    stub,
    context,
    lostCount: () => lost,
    restoredCount: () => restored,
    lose: (options = {}) => {
      const result = dispatchContextLost(canvas, {
        reason: options.reason ?? defaultReason,
        ...(options.onLost !== undefined ? { onLost: options.onLost } : {}),
      });
      lost += 1;
      events.push('webglcontextlost');
      return result;
    },
    restore: (options = {}) => {
      const result = dispatchContextRestored(canvas, {
        ...(options.reason !== undefined ? { reason: options.reason } : {}),
      });
      restored += 1;
      events.push('webglcontextrestored');
      return result;
    },
    sequence: () => [...events],
    dispose() {
      canvas.remove();
      stub.restore();
    },
  };
}
