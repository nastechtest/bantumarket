/**
 * The jsdom installation every DOM-touching harness module shares.
 *
 * Why one copy: `packages/ui-3d/src/viewer/tests/dom-env.ts`, `packages/ui-3d/src/fallback/test-dom.ts`
 * and `packages/design-system/src/tests/dom-setup.ts` each install their own globals with slightly
 * different key lists, and the difference bites — the fallback one deliberately ships no
 * `PointerEvent`, the viewer one ships no `ResizeObserver`. A test that switches helper therefore
 * switches environment, which reads like a product bug. This module is the single superset, and it
 * records exactly what it does NOT provide (real layout, real paint, WebGL) so nobody trusts a
 * measurement out of it.
 */
import { JSDOM } from 'jsdom';

/** Globals installed on `globalThis`, in dependency order for react-dom/client. */
const GLOBAL_KEYS = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLDivElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLAnchorElement',
  'HTMLImageElement',
  'HTMLFormElement',
  'HTMLCanvasElement',
  'Element',
  'Node',
  'NodeList',
  'DocumentFragment',
  'NodeFilter',
  'Text',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'InputEvent',
  'TouchEvent',
  'DOMParser',
  'XMLHttpRequest',
  'MutationObserver',
  'CSS',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
] as const;

export interface DomHandle {
  readonly window: Window & typeof globalThis;
  readonly document: Document;
  /** Stable mount point for `render()` when the caller does not pass a container. */
  root(): HTMLElement;
  /** Lets `render()` hand its root over so `reset()` can unmount it — React state leaks otherwise. */
  register(tree: { unmount(): void }): void;
  /** Removes everything rendered so far; call from `afterEach`, not from module scope. */
  reset(): void;
  restore(): void;
}

let handle: DomHandle | null = null;

/**
 * Idempotent: bun runs every test file in its own module graph but the global object is shared
 * within a file, and `render()` plus `webgl/stub.ts` both need the DOM up. A second call returns the
 * existing handle rather than stacking a second jsdom window.
 */
export function installDom(): DomHandle {
  if (handle !== null) return handle;

  // Another helper — each package ships its own `dom-setup` — may already have installed a window.
  // Adopt it instead of stacking a second jsdom: replacing the globals leaves a `win` captured at
  // import time pointing at a dead window, which is how the Sheet scroll-lock test started reading
  // `scrollY` as 0 while the component read the new window.
  const preinstalled = (globalThis as { document?: Document }).document;
  if (preinstalled !== undefined) {
    let registered: { unmount(): void } | null = null;
    handle = {
      window: globalThis.window as Window & typeof globalThis,
      document: preinstalled,
      root: () => preinstalled.body as HTMLElement,
      register: (tree) => {
        registered = tree;
      },
      reset: () => {
        registered?.unmount();
        registered = null;
      },
      restore: () => undefined,
    };
    return handle;
  }

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'https://market.test/',
  });
  const win = dom.window as unknown as Window & typeof globalThis;
  const g = globalThis as unknown as Record<string, unknown>;
  const previous = new Map<string, PropertyDescriptor | undefined>();

  for (const key of GLOBAL_KEYS) previous.set(key, Object.getOwnPropertyDescriptor(g, key));

  for (const key of GLOBAL_KEYS) {
    const value = key === 'window' ? win : (win as unknown as Record<string, unknown>)[key];
    if (value === undefined) continue;
    // jsdom binds some methods to its window; a bare `getComputedStyle(g.document)` still works,
    // so only the two that React calls as free functions need the bind.
    const bound =
      key === 'requestAnimationFrame' || key === 'cancelAnimationFrame' || key === 'getComputedStyle'
        ? (value as (...args: unknown[]) => unknown).bind(win)
        : value;
    Object.defineProperty(g, key, { value: bound, configurable: true, writable: true });
  }

  // React 18's act() refuses to run without the flag; set it here so no consumer remembers to.
  Object.defineProperty(g, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true });

  // jsdom has no PointerEvent at all. Pointer tests that fall back to MouseEvent silently lose
  // `pointerId`/`isPrimary`, which is the field pinch code reads — so synthesise the real shape.
  const winAny = win as unknown as Record<string, unknown>;
  if (winAny['PointerEvent'] === undefined) {
    const MouseEventCtor = winAny['MouseEvent'] as typeof MouseEvent;
    class PointerEvent extends MouseEventCtor {
      readonly pointerId: number;
      readonly pointerType: string;
      readonly isPrimary: boolean;
      readonly pressure: number;
      readonly tiltX: number;
      readonly tiltY: number;
      constructor(type: string, init: Record<string, unknown> = {}) {
        super(type, init as MouseEventInit);
        this.pointerId = (init['pointerId'] as number | undefined) ?? 1;
        this.pointerType = (init['pointerType'] as string | undefined) ?? 'mouse';
        this.isPrimary = (init['isPrimary'] as boolean | undefined) ?? true;
        this.pressure = (init['pressure'] as number | undefined) ?? 0.5;
        this.tiltX = (init['tiltX'] as number | undefined) ?? 0;
        this.tiltY = (init['tiltY'] as number | undefined) ?? 0;
      }
    }
    winAny['PointerEvent'] = PointerEvent;
    Object.defineProperty(g, 'PointerEvent', { value: PointerEvent, configurable: true, writable: true });
  }

  // Scroll-into-view and focus are called by focus-trap code; jsdom defines the methods as
  // "not implemented" throws on some builds. Replace with no-ops that still record the call, so a
  // test asserting "focus moved to the first field" has something to read.
  const scrollTargets: Element[] = [];
  win.Element.prototype.scrollIntoView = function (this: Element): void {
    scrollTargets.push(this);
  };
  (win as unknown as { __scrollIntoViewCalls: Element[] }).__scrollIntoViewCalls = scrollTargets;

  // jsdom returns zero-size rects for everything. A fixed, non-zero rect at least lets layout code
  // divide by width without producing NaN, which is what the gesture math does.
  win.HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    return rectOf(320, 320);
  };

  const document = win.document;
  const live: Array<{ unmount(): void }> = [];

  handle = {
    window: win,
    document,
    root() {
      const el = document.getElementById('root');
      if (el === null) throw new Error('testing/dom: jsdom document has no #root');
      return el;
    },
    register(tree: { unmount(): void }) {
      live.push(tree);
    },
    reset() {
      for (const tree of live.splice(0)) tree.unmount();
      document.querySelectorAll('[data-testing-container="true"]').forEach((el) => el.remove());
      const root = document.getElementById('root');
      if (root !== null) root.replaceChildren();
      scrollTargets.length = 0;
    },
    restore() {
      for (const [key, desc] of previous) {
        if (desc !== undefined) Object.defineProperty(g, key, desc);
        else delete g[key];
      }
      handle = null;
    },
  };
  return handle;
}

/**
 * A DOMRect that jsdom and TypeScript both accept. jsdom's own DOMRect constructor is not on every
 * build, so build a frozen literal rather than depend on it.
 */
function rectOf(width: number, height: number): DOMRect {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({ x: 0, y: 0, width, height }),
  };
  return rect as unknown as DOMRect;
}

export function domInstalled(): boolean {
  return handle !== null;
}

/** Current handle, or null. Modules that need the window for event construction use this. */
export function currentDom(): DomHandle | null {
  return handle;
}
