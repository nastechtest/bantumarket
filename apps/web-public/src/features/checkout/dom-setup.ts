import { JSDOM } from 'jsdom';

/**
 * jsdom bootstrap for checkout behaviour tests — same discipline as design-system's own setup:
 * Bun has no DOM, and a hand-rolled stub would let a screen "pass" while being unable to see what
 * a real browser trips over. Imported FIRST in test files so these globals land before
 * react-dom/client initialises.
 */
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/checkout/ord_01',
});
const win = dom.window;

const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.document = win.document;
for (const key of [
  'HTMLElement',
  'HTMLDivElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLAnchorElement',
  'HTMLLabelElement',
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
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
try {
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
} catch {
  // react-dom reads userAgent from window.navigator regardless.
}
// React 18 act() refuses to run without this flag.
g.IS_REACT_ACT_ENVIRONMENT = true;

export { dom, win };
