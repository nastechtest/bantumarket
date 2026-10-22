import { JSDOM } from 'jsdom';

/**
 * jsdom bootstrap for behaviour tests that need a live DOM (sheet focus/scroll). Imported first
 * in each test file so module-eval order puts these globals in place before react-dom/client
 * initialises. Bun's test runner has no DOM of its own; a hand-rolled `document` stub would let
 * the sheet "pass" while being unable to see what a real browser would trip over.
 */
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
const win = dom.window;

const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.document = win.document;
for (const key of [
  'HTMLElement',
  'HTMLDivElement',
  'HTMLInputElement',
  'Element',
  'Node',
  'Event',
  'KeyboardEvent',
  'MouseEvent',
  'CustomEvent',
  'DocumentFragment',
  'NodeFilter',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
try {
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
} catch {
  // Some runtimes freeze `navigator`; react-dom only reads userAgent from window.navigator anyway.
}
// React 18 act() refuses to run without this flag.
g.IS_REACT_ACT_ENVIRONMENT = true;

export { dom, win };
