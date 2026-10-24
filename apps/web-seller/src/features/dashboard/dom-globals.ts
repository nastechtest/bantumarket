/**
 * jsdom bootstrap ONLY — no React import may live here.
 *
 * `react-dom` decides `canUseDOM` at module-evaluation time. If `react-dom/client` is imported
 * before these globals exist it boots as a no-DOM build: renders appear to work and every
 * synthetic event is silently dropped. Keeping this file React-free is what makes import order in
 * `test-dom.tsx` load-bearing rather than decorative.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
export const win = dom.window;

const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.document = win.document;
for (const key of [
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'HTMLButtonElement',
  'HTMLAnchorElement',
  'Element',
  'Node',
  'Event',
  'InputEvent',
  'KeyboardEvent',
  'MouseEvent',
  'PopStateEvent',
  'CustomEvent',
  'DocumentFragment',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'localStorage',
  'sessionStorage',
]) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
try {
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
} catch {
  // Some runtimes freeze `navigator`; react-dom reads userAgent from window.navigator anyway.
}
g.IS_REACT_ACT_ENVIRONMENT = true;
