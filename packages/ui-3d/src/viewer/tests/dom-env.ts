import { JSDOM } from 'jsdom';

/**
 * jsdom is installed at the repo root but has no WebGL — every test that uses this helper must
 * assert on behaviour reachable without a GL context (React tree, DOM attributes, disposal,
 * visibility). The one test that genuinely needs a context lives in canvas-render.browser.test.tsx
 * and is skipped, not faked.
 */

let installed = false;

export function installJsdomGlobals(): void {
  if (installed) return;
  installed = true;
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'https://market.test/',
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const w = dom.window as unknown as Record<string, unknown>;
  g['window'] = dom.window;
  g['document'] = dom.window.document;
  g['navigator'] = dom.window.navigator;
  for (const key of ['HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MutationObserver', 'CSS']) {
    if (w[key] !== undefined) g[key] = w[key];
  }
  g['requestAnimationFrame'] = dom.window.requestAnimationFrame.bind(dom.window);
  g['cancelAnimationFrame'] = dom.window.cancelAnimationFrame.bind(dom.window);
  g['getComputedStyle'] = dom.window.getComputedStyle.bind(dom.window);
  g['IS_REACT_ACT_ENVIRONMENT'] = true;
}

export function rootElement(): HTMLElement {
  const el = document.getElementById('root');
  if (!el) throw new Error('test DOM has no #root');
  return el;
}
