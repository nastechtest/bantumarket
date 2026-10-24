import { installDom } from '../dom/env.js';

/**
 * A fake WebGL context, plus the record of what the code under test actually asked it for.
 *
 * Scope, stated honestly: this object answers the GL queries the product's capability and lifecycle
 * paths make — `getParameter(MAX_TEXTURE_SIZE)`, `getExtension('WEBGL_lose_context')`,
 * `isContextLost()`, `drawingBufferWidth` — and it fires the same DOM events a real driver fires when
 * it is told to lose the context. It does NOT rasterise anything. A pixel-level assertion is still a
 * real-browser assertion, which is exactly what
 * `packages/ui-3d/src/viewer/tests/canvas-render.browser.test.tsx` says in its own header; this file
 * removes the *other* half of that gap, the half that jsdom cannot reach and the product must survive:
 * null contexts, loss, and restoration.
 *
 * The `unknownCalls` log is the point of the whole design. Anything beyond the answered surface is
 * recorded and answered with a no-op rather than silently succeeding, so a test can assert
 * `glCalls().length === 0` to prove the static path never touched GL — Rule 1 ("3D is never
 * load-bearing") as a measurable claim instead of a hope.
 */

/** GL_ENUM values used by this repo, from the WebGL 2 spec constants. */
export const GL = {
  MAX_TEXTURE_SIZE: 0x0d33,
  MAX_RENDERBUFFER_SIZE: 0x84e8,
  MAX_VERTEX_ATTRIBS: 0x8869,
  VERSION: 0x1f02,
  VENDOR: 0x1f01,
  RENDERER: 0x1f03,
  UNMASKED_VENDOR_WEBGL: 0x9245,
  UNMASKED_RENDERER_WEBGL: 0x9246,
  FRAMEBUFFER: 0x8d40,
  NO_ERROR: 0,
} as const;

export interface FakeWebGLContextOptions {
  /** What `getParameter(MAX_TEXTURE_SIZE)` answers. Drives `canFetchScene`. */
  readonly maxTextureSize?: number;
  /** Context version advertised to the code under test: 1 or 2. */
  readonly version?: 1 | 2;
  /** Drawing buffer size for DPR-cap assertions. */
  readonly drawingBufferWidth?: number;
  readonly drawingBufferHeight?: number;
}

export interface ContextLostEventInit {
  readonly reason?: string;
}

export interface FakeWebGLContext {
  readonly canvas: HTMLCanvasElement;
  readonly version: 1 | 2;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  getParameter(pname: number): number | string | null;
  getExtension(name: string): { loseContext(): void; restoreContext(): void } | null;
  getSupportedExtensions(): string[];
  isContextLost(): boolean;
  getContextAttributes(): Record<string, boolean | number>;
  /** Every unimplemented entry point reached, in order, de-duplicated by name. */
  unknownCalls(): readonly string[];
  /** Every entry point reached, answered or not — the "did the static path touch GL?" assertion. */
  allCalls(): readonly string[];
  resetCallLog(): void;
  /** Fire `webglcontextlost` on the canvas the way a driver does. Returns whether it was prevented. */
  loseContext(init?: ContextLostEventInit): boolean;
  /** Fire `webglcontextrestored`; only legal after `loseContext`. */
  restoreContext(init?: ContextLostEventInit): boolean;
  readonly state: { lost: boolean; restored: boolean };
  /**
   * Harness-internal: read the loss flag without going through `isContextLost()`, which is a tracked
   * GL call. `webgl/fail-context.ts` uses it so dispatching the DOM event and marking the context
   * dead stay ONE transition instead of two.
   */
  internalState(): { lost: boolean; restored: boolean };
  /** Harness-internal: flip the loss flag WITHOUT dispatching another event. */
  setLost(next: boolean): void;
}

export function createFakeWebGLContext(
  canvas: HTMLCanvasElement,
  options: FakeWebGLContextOptions = {},
): FakeWebGLContext {
  const version = options.version ?? 2;
  const maxTextureSize = options.maxTextureSize ?? 4096;
  const unknown: string[] = [];
  const every: string[] = [];
  const state = { lost: false, restored: false };

  const answers = new Map<number, number | string>([
    [GL.MAX_TEXTURE_SIZE, maxTextureSize],
    [GL.MAX_RENDERBUFFER_SIZE, maxTextureSize],
    [GL.MAX_VERTEX_ATTRIBS, 16],
    [
      GL.VERSION,
      version === 2 ? 'WebGL 2.0 (Fake, jsdom)' : 'WebGL 1.0 (Fake, jsdom)',
    ],
    [GL.VENDOR, 'Nastech Testing Harness'],
    [GL.RENDERER, 'nastech-fake-gl (no rasteriser)'],
  ]);

  const dispatch = (type: string, cancelable: boolean, detail: Record<string, unknown>): boolean => {
    const { window } = installDom();
    const event = new window.Event(type, { bubbles: false, cancelable });
    Object.assign(event as unknown as Record<string, unknown>, detail);
    // `dispatchEvent` returns false exactly when a handler called preventDefault — for
    // `webglcontextlost` that return value IS the browser's signal that a restore is allowed, so
    // callers get it rather than a bare void.
    return !canvas.dispatchEvent(event);
  };

  const loseContext = (init: ContextLostEventInit = {}): boolean => {
    if (state.lost) return false;
    const prevented = dispatch('webglcontextlost', true, {
      statusMessage: init.reason ?? 'nastech-fake-context-lost',
    });
    state.lost = true;
    return prevented;
  };

  const restoreContext = (init: ContextLostEventInit = {}): boolean => {
    if (!state.lost) {
      throw new Error(
        '[testing/webgl] restoreContext() called on a context that was never lost. ' +
          'A real driver only emits webglcontextrestored after webglcontextlost was preventDefault-ed.',
      );
    }
    const prevented = dispatch('webglcontextrestored', false, {
      statusMessage: init.reason ?? 'nastech-fake-context-restored',
    });
    state.restored = true;
    state.lost = false;
    return prevented;
  };

  const loseContextExtension = {
    loseContext: () => {
      loseContext({ reason: 'WEBGL_lose_context.loseContext()' });
    },
    restoreContext: () => {
      restoreContext({ reason: 'WEBGL_lose_context.restoreContext()' });
    },
  };

  const implemented: Record<string, unknown> = {
    canvas,
    version,
    drawingBufferWidth: options.drawingBufferWidth ?? 300,
    drawingBufferHeight: options.drawingBufferHeight ?? 150,
    getParameter: (pname: number) => {
      every.push('getParameter');
      if (state.lost) return null;
      if (pname === GL.UNMASKED_RENDERER_WEBGL || pname === GL.UNMASKED_VENDOR_WEBGL) {
        return 'nastech-fake-gl (no rasteriser)';
      }
      return answers.get(pname) ?? null;
    },
    getExtension: (name: string) => {
      every.push('getExtension');
      if (state.lost) return null;
      if (name === 'WEBGL_lose_context') return loseContextExtension;
      if (name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_VENDOR_WEBGL: GL.UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL: GL.UNMASKED_RENDERER_WEBGL };
      }
      return null;
    },
    getSupportedExtensions: () => {
      every.push('getSupportedExtensions');
      return ['WEBGL_lose_context', 'WEBGL_debug_renderer_info'];
    },
    isContextLost: () => {
      every.push('isContextLost');
      return state.lost;
    },
    getContextAttributes: () => {
      every.push('getContextAttributes');
      return { alpha: true, antialias: version === 2 ? false : false, depth: true, premultipliedAlpha: true };
    },
    getError: () => {
      every.push('getError');
      return GL.NO_ERROR;
    },
  };

  const target: Record<string, unknown> = {
    ...implemented,
    unknownCalls: () => [...unknown],
    allCalls: () => [...every],
    resetCallLog() {
      unknown.length = 0;
      every.length = 0;
    },
    loseContext,
    restoreContext,
    state,
    internalState: () => state,
    setLost: (next: boolean) => {
      state.lost = next;
      if (!next) state.restored = true;
    },
  };

  // A Proxy rather than a hand-listed set of no-ops: the alternative is a fake that quietly
  // "supports" whatever method someone adds next, which is how a broken render looks green.
  return new Proxy(target, {
    get(receiver, property) {
      if (typeof property !== 'string') return Reflect.get(receiver, property);
      if (property in receiver) return Reflect.get(receiver, property);
      if (property === 'then') return undefined; // never look like a thenable to an await site
      if (!unknown.includes(property)) unknown.push(property);
      if (!every.includes(property)) every.push(property);
      // Unknown entry points answer as no-op functions rather than throwing: three calls
      // `disable(CULL_FACE)` during setup on a path that is otherwise about sizing, and a fake that
      // throws there fails a test for the wrong reason. The call is still in `allCalls()`, so the
      // gap is visible instead of invisible.
      return (...args: unknown[]) => {
        void args;
        return null;
      };
    },
    set(receiver, property, value) {
      return Reflect.set(receiver, property, value);
    },
  }) as unknown as FakeWebGLContext;
}
