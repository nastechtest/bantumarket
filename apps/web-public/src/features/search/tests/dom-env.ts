import { JSDOM } from 'jsdom';

/**
 * jsdom bootstrap for search behaviour tests, mirroring the repo pattern (design-system
 * dom-setup): Bun's test runner has no DOM, and a hand-rolled stub would let the sheet, the
 * focus ring, and history.pushState "pass" while hiding exactly what a browser would trip over.
 * Imported first in each test file so the globals exist before react-dom/client initialises.
 */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/search',
});
const win = dom.window;

const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.document = win.document;
for (const key of [
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLSelectElement',
  'Element',
  'Node',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'MouseEvent',
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
  // react-dom only reads userAgent from window.navigator anyway; a frozen global is not a failure.
}
g.IS_REACT_ACT_ENVIRONMENT = true;

export { dom, win };

export function rootElement(): HTMLElement {
  const el = document.getElementById('root');
  if (el === null) throw new Error('test DOM has no #root');
  return el;
}

export function freshHost(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}
