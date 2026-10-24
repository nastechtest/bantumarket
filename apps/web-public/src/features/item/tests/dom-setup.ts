import { JSDOM } from 'jsdom';

/**
 * Local jsdom bootstrap (the same technique design-system's tests use; that file lives under
 * `packages/design-system/src/tests/` which this agent does not own and which is not exported
 * from the package entry — wave B rule: put it in your own directory and say so).
 */
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost:5173/item/lst_01',
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
  'PointerEvent',
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
  // navigator frozen on some runtimes; react-dom reads window.navigator anyway.
}
g.IS_REACT_ACT_ENVIRONMENT = true;

export { dom, win };
