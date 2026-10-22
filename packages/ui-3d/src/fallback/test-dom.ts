import { JSDOM } from 'jsdom';

// RTL registers a global beforeAll for auto-cleanup, which bun's runner rejects outside a describe
// block. We unmount explicitly instead.
process.env.RTL_SKIP_AUTO_CLEANUP = 'true';

export interface RenderHarness {
  rtl: typeof import('@testing-library/react');
  dom: DomHandle;
  /** Renders and remembers the tree so `reset()` can unmount it; React state leaks otherwise. */
  render(ui: React.ReactElement): ReturnType<typeof import('@testing-library/react').render>;
  reset(): void;
}

let harness: RenderHarness | null = null;

/** Shared DOM + RTL setup for the component tests, with explicit teardown. */
export async function createRenderHarness(): Promise<RenderHarness> {
  if (harness) {
    harness.reset();
    return harness;
  }
  const dom = installDom();
  const rtl = await import('@testing-library/react');
  const live: Array<{ unmount(): void }> = [];
  harness = {
    rtl,
    dom,
    render: (ui) => {
      const result = rtl.render(ui, { baseElement: dom.container });
      live.push(result);
      return result;
    },
    reset() {
      for (const tree of live) tree.unmount();
      live.length = 0;
    },
  };
  return harness;
}

export function teardownHarness(): void {
  harness?.reset();
  harness?.dom.restore();
  harness = null;
}


/**
 * Minimal DOM for the fallback tests. Rule 1 means these components must render with no WebGL and no
 * canvas, so the harness deliberately provides nothing else: no canvas context, no WebGL, no
 * requestAnimationFrame. A component that needs one of those is not a fallback.
 */
const GLOBAL_KEYS = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'PointerEvent',
  'getComputedStyle',
] as const;

export interface DomHandle {
  readonly window: any;
  readonly document: any;
  readonly container: HTMLElement;
  restore(): void;
}

export function installDom(): DomHandle {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: false,
  });
  const g = globalThis as Record<string, unknown>;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const key of GLOBAL_KEYS) previous.set(key, Object.getOwnPropertyDescriptor(g, key));

  const win = dom.window as any;
  Object.defineProperty(g, 'window', { value: win, configurable: true, writable: true });
  for (const key of GLOBAL_KEYS) {
    if (key === 'window') continue;
    Object.defineProperty(g, key, { value: win[key], configurable: true, writable: true });
  }
  Object.defineProperty(g, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true });
  // React measures layout through these; jsdom returns zeros, which is fine for structure asserts.
  win.HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    return { x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 320, width: 320, height: 320 };
  };
  // jsdom ships no PointerEvent, and without it a fired pointer event carries no clientX at all.
  if (!win.PointerEvent) {
    win.PointerEvent = class PointerEvent extends win.MouseEvent {
      constructor(type: string, init: Record<string, any> = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
        this.isPrimary = init.isPrimary ?? true;
      }
    };
  }
  Object.defineProperty(g, 'PointerEvent', { value: win.PointerEvent, configurable: true, writable: true });

  const container = win.document.getElementById('root') as HTMLElement;
  return {
    window: win,
    document: win.document,
    container,
    restore() {
      for (const [key, desc] of previous) {
        if (desc) Object.defineProperty(g, key, desc);
        else delete g[key];
      }
    },
  };
}
