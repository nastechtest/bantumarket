import { JSDOM } from 'jsdom';

/**
 * jsdom bootstrap for this feature's behaviour tests — a local copy of the wave-A pattern because
 * feature directories do not import each other's test internals. Import first in DOM tests so the
 * globals exist before react-dom/client initialises; `bun test` has no DOM of its own.
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
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'CustomEvent',
  'DocumentFragment',
]) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
// React 18 act() refuses to run without this flag.
g.IS_REACT_ACT_ENVIRONMENT = true;

// Dynamic, not static: ESM hoists static imports above this bootstrap, and `react-dom/test-utils`
// is a `react-dom` entry — it must not initialise before the globals exist. Top-level await keeps
// `typeInto` synchronous for its callers.
const { Simulate } = await import('react-dom/test-utils');

/**
 * Type into a controlled React field.
 *
 * React's ChangeEventPlugin decides `isInputEventSupported` at module-init, and react-dom is
 * evaluated before this file's jsdom globals exist (bun's CJS-first import interop), so the plugin
 * keeps its pre-`input` IE branch: a dispatched `input` or `change` event never produces an
 * `onChange`, and the `focusin` that would arm the polyfill calls `attachEvent`, which jsdom does
 * not have. `Simulate.change` builds the `onChange` synthetic event and runs the normal two-phase
 * dispatch on the node, so the component under test still executes its real handler — and the
 * value it reads is the one the prototype setter wrote, exactly as a keystroke leaves it.
 */
export function typeInto(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const proto =
    el instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, text);
  else el.value = text;
  Simulate.change(el);
}

export { dom, win };
