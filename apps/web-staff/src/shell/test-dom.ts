import { JSDOM } from 'jsdom';

/**
 * jsdom bootstrap for the console's behaviour tests. Imported first, before any module that
 * touches `document` at import time. Bun has no DOM; a hand-rolled stub would let a table "pass"
 * while being unable to see the semantics a browser applies.
 */
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
const win = dom.window;

const globals = globalThis as unknown as Record<string, unknown>;
globals.window = win;
globals.document = win.document;
for (const key of [
  'HTMLElement',
  'HTMLDivElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
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
  'localStorage',
  'sessionStorage',
]) {
  globals[key] = (win as unknown as Record<string, unknown>)[key];
}
try {
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
} catch {
  // Covered by window.navigator for react-dom.
}
globals.IS_REACT_ACT_ENVIRONMENT = true;

export { dom, win };
