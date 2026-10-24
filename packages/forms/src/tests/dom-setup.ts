import { JSDOM } from 'jsdom';

/**
 * jsdom bootstrap for the DOM-backed tests. Imported *first* in each test file so module-eval order
 * installs these globals before `react-dom/client` initialises — Bun's runner has no DOM of its own.
 *
 * `IS_REACT_ACT_ENVIRONMENT` is what lets `act()` work; without it React 18 refuses to flush and the
 * a11y assertions would be reading an unmounted tree while still "passing" on a truthiness check.
 */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
const win = dom.window;

const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.document = win.document;
for (const key of [
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLLabelElement',
  'HTMLAnchorElement',
  'HTMLButtonElement',
  'Element',
  'Node',
  'Event',
  'FocusEvent',
  'InputEvent',
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
  // react-dom reads userAgent off `window.navigator` anyway.
}
g.IS_REACT_ACT_ENVIRONMENT = true;

export function attach(container?: HTMLElement): HTMLElement {
  const host = container ?? win.document.createElement('div');
  if (host.parentNode === null) win.document.body.appendChild(host);
  return host;
}

export function detach(host: HTMLElement): void {
  host.parentNode?.removeChild(host);
}

export { dom, win };
