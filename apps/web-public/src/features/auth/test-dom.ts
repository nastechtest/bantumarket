/**
 * jsdom mount helpers for behaviour tests in features/auth (shared with features/account —
 * both directories belong to this brief). Import order below is load-bearing: `dom-globals`
 * must be fully evaluated before `react-dom/client`, or react-dom boots as a no-DOM build and
 * silently drops every synthetic event (see the comment in dom-globals.ts).
 */
import './dom-globals.js';
import { act, cloneElement } from 'react';
import type { ReactElement } from 'react';
import { win } from './dom-globals.js';

// `react-dom` snapshots `canUseDOM` (and, through it, whether native `input` events are
// supported) at module-evaluation time. Under `bun test` a static `react-dom/client` import is
// evaluated before this file's jsdom bootstrap has run, so React decides inputs are unsupported
// and silently routes every text field through an IE-era polyfill: typing updates the DOM value
// and React never sees it. Importing it here, after the side-effect import above, keeps the
// harness honest for real users of this app. Top-level await is deliberate — `mount` stays
// synchronous for its callers.
const { createRoot } = await import('react-dom/client');
// Same timing constraint as above: `react-dom/test-utils` is a `react-dom` entry, so it must not
// be pulled in as a static dependency of the test file (Bun evaluates CJS dependencies before
// ESM side effects, which is the whole reason for this file's import discipline).
const { Simulate } = await import('react-dom/test-utils');

export interface Mounted {
  readonly container: HTMLElement;
  /** Flush pending effects and microtasks (fixture promises) inside React's act queue. */
  flush(): Promise<void>;
  /** Re-render after moving an external clock, so clock-derived UI recomputes. */
  rerender(ui: ReactElement): Promise<void>;
  unmount(): void;
}

export function mount(ui: ReactElement): Mounted {
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const root = createRoot(container);
  void act(() => {
    root.render(ui);
  });
  return {
    container,
    async flush() {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    },
    async rerender(next) {
      await act(async () => {
        // A fresh element object, not the one the caller already rendered: React bails out of a
        // second render of the same element (same props object), which would leave clock-derived
        // UI stale after `advance()` moved the injected clock.
        root.render(cloneElement(next));
      });
    },
    unmount() {
      void act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export async function flush(fn?: () => void): Promise<void> {
  await act(async () => {
    fn?.();
    await new Promise((r) => setTimeout(r, 0));
  });
}

/**
 * Type into a controlled React input the way a browser does: update the native value through the
 * prototype setter (bypassing React's value tracker, exactly as a keystroke would) and then hand
 * React the change.
 *
 * The second half uses `Simulate.change` rather than a dispatched `input` event because Bun
 * evaluates this repo's CJS `react-dom` before any ESM DOM bootstrap can run, so React computes
 * "native input events are unsupported" and routes text fields through its IE-era polyfill. A
 * dispatched `input` event then updates the DOM and is silently ignored by `onChange`, which is
 * how a bar of tests can "type" into an empty state. `Simulate` invokes the same React
 * `onChange` listeners through the normal two-phase dispatch, so the component under test still
 * exercises its real handler — no production code exists to be made test-aware.
 */
export async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    if (setter) setter.call(input, value);
    else input.value = value;
    Simulate.change(input);
  });
}

export async function click(el: Element): Promise<void> {
  await act(async () => {
    (el as HTMLElement).dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

export function byTestId(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${id}"]`);
  if (el === null) throw new Error(`no element with data-testid="${id}" — testid typo or wrong screen`);
  return el as HTMLElement;
}

export function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const buttons = [...container.querySelectorAll('button')];
  const found = buttons.find((b) => (b.textContent ?? '').includes(text));
  if (found === undefined) throw new Error(`no button containing "${text}" among ${buttons.length} buttons`);
  return found;
}

export function inputByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const labels = [...container.querySelectorAll('label')];
  const found = labels.find((l) => (l.textContent ?? '').includes(label));
  if (found === undefined || found.htmlFor === '') throw new Error(`no label containing "${label}" wired to an input`);
  const input = container.querySelector(`#${found.htmlFor}`);
  if (input === null) throw new Error(`label "${label}" points at missing id "${found.htmlFor}"`);
  return input as HTMLInputElement;
}

export function text(container: HTMLElement): string {
  return container.textContent ?? '';
}
