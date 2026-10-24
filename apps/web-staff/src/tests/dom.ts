import { JSDOM } from 'jsdom';

/**
 * The console's tests need a document before any module that touches `window` at import time
 * (the controller router installs listeners at module scope). Bun has no DOM, so this file must be
 * the first import in every DOM-touching suite. It installs one jsdom window per test file; files
 * run in separate module graphs, so sharing the global is safe and cheaper than a mock DOM that
 * cannot express landmark semantics.
 */
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
const win = dom.window;
const globals = globalThis as unknown as Record<string, unknown>;

function define(key: string, value: unknown): void {
  try {
    Object.defineProperty(globals, key, { value, configurable: true, writable: true });
  } catch {
    globals[key] = value;
  }
}

/**
 * Re-installs this file's jsdom window as the process globals. Every DOM-touching suite gets its
 * own window at import time, but Bun runs files concurrently in one process, so a later import can
 * replace `window` while an earlier suite is still mounted. A suite that attaches listeners in an
 * effect must call this in `beforeEach` so the window it dispatches on is the window React mounted
 * into.
 */
export function installDomGlobal(): void {
  define('window', win);
  define('document', win.document);
  for (const key of [
    'HTMLElement',
    'HTMLDivElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLSelectElement',
    'HTMLButtonElement',
    'HTMLAnchorElement',
    'HTMLLabelElement',
    'HTMLMetaElement',
    'HTMLFormElement',
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
    'CSS',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'localStorage',
    'sessionStorage',
  ]) {
    const value = (win as unknown as Record<string, unknown>)[key];
    if (value !== undefined) define(key, value);
  }
  try {
    Object.defineProperty(globals, 'navigator', { value: win.navigator, configurable: true });
  } catch {
    // react-dom falls back to window.navigator.
  }
  define('IS_REACT_ACT_ENVIRONMENT', true);
}

installDomGlobal();

export { dom, win };
