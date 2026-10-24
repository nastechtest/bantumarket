/**
 * jsdom bootstrap ONLY — no React imports live here.
 *
 * This separation is load-bearing: `react-dom` computes `canUseDOM` at module-evaluation time.
 * If `react-dom/client` is imported before these globals exist, it initializes as a
 * no-DOM build, renders still work, and every synthetic event is silently dropped — tests that
 * "type" and then assert on a screen that never changed. Keep this file React-free; mount
 * helpers belong in test-dom.ts, which imports THIS file first.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/sign-in',
});
export const win = dom.window;

const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.document = win.document;
for (const key of [
  'HTMLElement',
  'HTMLInputElement',
  'HTMLSelectElement',
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
]) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
try {
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
} catch {
  // react-dom reads userAgent from window.navigator anyway.
}
g.IS_REACT_ACT_ENVIRONMENT = true;
