import { JSDOM } from 'jsdom';

// RTL registers a global beforeAll for auto-cleanup, which bun's runner rejects outside a describe
// block, so we unmount explicitly. The harness saves the previous value and puts it back on
// `restore()`: this flag is process-wide, and a suite that DOES rely on auto-cleanup must not be
// silently demounted by whatever ran earlier in the same `bun test` process.
const previousSkipCleanup = process.env.RTL_SKIP_AUTO_CLEANUP;
process.env.RTL_SKIP_AUTO_CLEANUP = 'true';

export interface RenderHarness {
  render(ui: React.ReactElement): { container: HTMLElement; unmount(): void; asFragment(): DocumentFragment };
  reset(): void;
  restore(): void;
}

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
  'ResizeObserver',
] as const;

/** Minimal DOM for the inspect components. No canvas, no WebGL — rule 1 means these must pass without. */
export async function createHarness(): Promise<RenderHarness> {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/item/lst_01/inspect',
    pretendToBeVisual: false,
  });
  const g = globalThis as Record<string, unknown>;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const key of GLOBAL_KEYS) previous.set(key, Object.getOwnPropertyDescriptor(g, key));

  const win = dom.window as unknown as Record<string, unknown> & { window: Window };
  // Window carries no index signature and this file installs globals by name, so it needs the index
  // view once — one alias beats four casts that each have to route through unknown.
  const w = win.window as unknown as Record<string, unknown> & Window;
  Object.defineProperty(g, 'window', { value: win.window, configurable: true, writable: true });
  for (const key of GLOBAL_KEYS) {
    if (key === 'window') continue;
    Object.defineProperty(g, key, { value: w[key], configurable: true, writable: true });
  }
  Object.defineProperty(g, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true });
  // jsdom's canvas.getContext throws "Not implemented"; probeCapability treats a null context as
  // gl:'none'. Stub it so the no-WebGL static path is the deterministic outcome, not a logged error.
  (w.HTMLCanvasElement as { prototype: Record<string, unknown> }).prototype.getContext = () => null;
  if (typeof w.ResizeObserver === 'undefined') {
    Object.defineProperty(win.window, 'ResizeObserver', {
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(g, 'ResizeObserver', { value: w.ResizeObserver, configurable: true, writable: true });
  }

  const rtl = await import('@testing-library/react');
  const container = w.document.getElementById('root') as HTMLElement;
  const live: Array<{ unmount(): void }> = [];

  return {
    render(ui) {
      const result = rtl.render(ui, { baseElement: container });
      live.push(result);
      return result;
    },
    reset() {
      for (const tree of live) tree.unmount();
      live.length = 0;
      container.innerHTML = '';
    },
    restore() {
      for (const tree of live) tree.unmount();
      live.length = 0;
      for (const [key, desc] of previous) {
        if (desc) Object.defineProperty(g, key, desc);
        else delete g[key];
      }
      if (previousSkipCleanup === undefined) delete process.env.RTL_SKIP_AUTO_CLEANUP;
      else process.env.RTL_SKIP_AUTO_CLEANUP = previousSkipCleanup;
      // Stops this realm's timers and resource loader; a leaked window keeps firing after its
      // globals have been handed back.
      dom.window.close();
    },
  };
}
