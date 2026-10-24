import { JSDOM } from 'jsdom';

/**
 * jsdom bootstrap for the seller shell's behaviour tests. Imported first in every test that
 * renders, so the globals exist before `react-dom/client` is evaluated (react-dom decides
 * `canUseDOM` at module evaluation time).
 *
 * Bun evaluates every test file's modules in one global environment. If another suite has
 * already installed a jsdom window, adopt it instead of replacing it: `react-dom` captures the
 * current `document`, and a second window would leave that suite setting values through one
 * window's prototypes on elements owned by another.
 */
const existing = (globalThis as { window?: Window }).window;
const adopted = existing !== undefined && existing.document !== undefined;
const dom = adopted
  ? null
  : new JSDOM('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost/payouts',
    });
export const win = (adopted ? existing : dom!.window) as Window & typeof globalThis;

const globals = globalThis as unknown as Record<string, unknown>;
globals.window = win;
globals.document = win.document;
for (const key of [
  'HTMLElement',
  'HTMLDivElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'Element',
  'Node',
  'Event',
  'InputEvent',
  'KeyboardEvent',
  'MouseEvent',
  'CustomEvent',
  'DocumentFragment',
  'NodeFilter',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  globals[key] = (win as unknown as Record<string, unknown>)[key];
}
try {
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
} catch {
  // react-dom reads userAgent from window.navigator anyway.
}
globals.IS_REACT_ACT_ENVIRONMENT = true;
