import { installDom } from '../dom/env.js';
import { createFakeWebGLContext, type FakeWebGLContext, type FakeWebGLContextOptions } from './context.js';

/**
 * The shared WebGL stub. Replaces the third hand-rolled copy.
 *
 * Today `packages/ui-3d` fakes this in three places with three different answers:
 * `viewer/tests/dom-env.ts` installs jsdom and documents that there is no GL,
 * `fallback/test-dom.ts` deliberately installs no `requestAnimationFrame` and asserts
 * `typeof WebGLRenderingContext === 'undefined'`, and `viewer/tests/canvas-render.browser.test.tsx`
 * skips the two cases it cannot reach and leaves them as comments. All three are honest, and none of
 * them is reusable: an app agent that wants "the device has WebGL2 but it dies mid-drag" today
 * re-implements the event plumbing again, and the version that invents `webglcontextlost` wrongly is
 * the version that lets a real regression through.
 *
 * Modes answer the three shapes the product branches on. `probeCapability()` in
 * `packages/ui-3d/src/quality/capability.ts` reads exactly `getContext('webgl2')`,
 * `getParameter(MAX_TEXTURE_SIZE)` and `getExtension('WEBGL_lose_context')`, so those are the
 * contract this stub satisfies. It still does not rasterise anything: the honest limit of every mode
 * is the same limit `canvas-render.browser.test.tsx` states — real pixels need a real browser.
 */

export type WebGLStubMode = 'webgl2' | 'webgl1' | 'none' | 'throw';

export interface WebGLStubOptions extends FakeWebGLContextOptions {
  readonly mode?: WebGLStubMode;
}

export interface WebGLStubHandle {
  readonly mode: WebGLStubMode;
  setMode(mode: WebGLStubMode): void;
  /** Every context this stub has handed out, in creation order. */
  contexts(): readonly FakeWebGLContext[];
  /** The contexts created for one canvas — a canvas may be asked for both `webgl` and `webgl2`. */
  contextsFor(canvas: HTMLCanvasElement): readonly FakeWebGLContext[];
  lastContext(): FakeWebGLContext | null;
  /** Contexts created since the last clear; proves the static path created none (Rule 1). */
  createdSinceMark(): number;
  mark(): void;
  /** A detached canvas with a fake context attached — the fixture a viewer test actually wants. */
  createCanvas(width?: number, height?: number): { canvas: HTMLCanvasElement; context: FakeWebGLContext | null };
  restore(): void;
}

const GL_ATTRIBUTES = new Set(['webgl2', 'webgl', 'experimental-webgl']);

export function installWebGLStub(options: WebGLStubOptions = {}): WebGLStubHandle {
  const dom = installDom();
  const prototype = dom.window.HTMLCanvasElement.prototype as unknown as {
    getContext: (this: HTMLCanvasElement, attributes: string, options?: unknown) => unknown;
  };
  const previousDescriptor = Object.getOwnPropertyDescriptor(dom.window.HTMLCanvasElement.prototype, 'getContext');
  const nativeGetContext = prototype.getContext;

  let mode: WebGLStubMode = options.mode ?? 'webgl2';
  const created: FakeWebGLContext[] = [];
  const byCanvas = new WeakMap<HTMLCanvasElement, FakeWebGLContext[]>();
  let markCount = 0;

  function contextFor(canvas: HTMLCanvasElement): FakeWebGLContext | null {
    if (mode === 'none' || mode === 'throw') return null;
    const existing = byCanvas.get(canvas)?.[0];
    if (existing !== undefined) return existing;
    const createdContext = createFakeWebGLContext(canvas, options);
    created.push(createdContext);
    const list = byCanvas.get(canvas) ?? [];
    byCanvas.set(canvas, [...list, createdContext]);
    // Stamped for `fail-context.ts`'s lookup: finding the context a component created must not
    // require calling `getContext` again, because a second call is itself a GL call the test may be
    // asserting never happened.
    Object.defineProperty(canvas, '__nastechGlContext', { value: createdContext, configurable: true });
    return createdContext;
  }

  function getContext(this: HTMLCanvasElement, attribute: string, _attrs?: unknown): unknown {
    if (!GL_ATTRIBUTES.has(attribute)) {
      // '2d' and everything else stay with jsdom: faking those would hide a real difference, and the
      // fallback components that read a 2D context are supposed to be tested against jsdom's answer.
      return nativeGetContext.call(this, attribute, _attrs);
    }
    if (mode === 'none') return null;
    if (mode === 'throw') {
      // Some Android WebViews throw instead of returning null when the GPU process is gone.
      throw new Error(`Failed to obtain ${attribute} context (nastech testing stub)`);
    }
    return contextFor(this);
  }

  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', {
    value: getContext,
    configurable: true,
    writable: true,
  });

  const handle: WebGLStubHandle = {
    get mode() {
      return mode;
    },
    setMode(next: WebGLStubMode) {
      mode = next;
    },
    contexts: () => [...created],
    contextsFor: (canvas: HTMLCanvasElement) => [...(byCanvas.get(canvas) ?? [])],
    lastContext: () => created[created.length - 1] ?? null,
    createdSinceMark: () => created.length - markCount,
    mark() {
      markCount = created.length;
    },
    createCanvas(width = 300, height = 150) {
      const canvas = dom.document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      dom.document.body.appendChild(canvas);
      const context = mode === 'none' || mode === 'throw' ? null : contextFor(canvas);
      return { canvas, context };
    },
    restore() {
      if (previousDescriptor !== undefined) {
        Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', previousDescriptor);
      } else {
        // jsdom defines getContext on the prototype but without a descriptor of its own; deleting the
        // override reveals the native method again.
        Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', {
          value: nativeGetContext,
          configurable: true,
          writable: true,
        });
      }
      created.length = 0;
    },
  };

  return handle;
}

/**
 * The bare no-WebGL install: `getContext('webgl2')` answers null, which is the single most common
 * product path (the entire static fallback). Named so a test can say what it means instead of
 * configuring an enum.
 */
export function installNoWebGL(): WebGLStubHandle {
  return installWebGLStub({ mode: 'none' });
}
