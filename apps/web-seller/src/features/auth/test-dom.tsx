import './dom-globals.js';
import { act } from 'react';
import { Simulate } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';
import { win } from './dom-globals.js';

export interface Mounted {
  readonly container: HTMLElement;
  flush(): Promise<void>;
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
        root.render(next);
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
 * Type into a controlled React input.
 *
 * A dispatched `input`/`change` event does NOT reach `onChange` here, and the failure is silent:
 * the DOM value changes, React ignores it, and the test "types" into an empty state. Bun evaluates
 * react-dom's CJS bundle before this file's jsdom bootstrap can run, so `canUseDOM` is false at
 * module init, `isInputEventSupported` stays false, and ChangeEventPlugin keeps its IE-era polyfill
 * branch — which extracts text-field changes from `keydown`/`focusin` only, and on `focusin` calls
 * `activeElement.attachEvent`, a method jsdom does not have. `Simulate.change` builds the
 * `onChange` synthetic event and runs the real two-phase dispatch on the node, so the component's
 * own handler executes; the prototype setter is still what writes the value, so the handler reads
 * the text a user typed rather than a test fixture's.
 */
export async function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = input instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    if (setter) setter.call(input, value);
    else input.value = value;
    Simulate.change(input);
  });
}

export async function selectOption(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    select.value = value;
    Simulate.change(select);
  });
}

export async function click(el: Element | null): Promise<void> {
  if (el === null) throw new Error('click: element not found');
  await act(async () => {
    (el as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
  });
}

export function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function byTestId(container: ParentNode, id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

export function byRole(container: ParentNode, role: string, name?: string): HTMLElement | null {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(`[role="${role}"]`));
  if (name === undefined) return nodes[0] ?? null;
  return nodes.find((n) => text(n).toLowerCase().includes(name.toLowerCase())) ?? null;
}

export function buttonByText(container: ParentNode, label: string): HTMLButtonElement | null {
  const buttons = Array.from(container.querySelectorAll('button'));
  return buttons.find((b) => text(b).toLowerCase().includes(label.toLowerCase())) ?? null;
}

export function linkByText(container: ParentNode, label: string): HTMLAnchorElement | null {
  const anchors = Array.from(container.querySelectorAll('a'));
  return anchors.find((a) => text(a).toLowerCase().includes(label.toLowerCase())) ?? null;
}

export function inputByLabel(container: ParentNode, label: string): HTMLInputElement | null {
  const labels = Array.from(container.querySelectorAll('label'));
  const match = labels.find((l) => text(l).toLowerCase() === label.toLowerCase() || text(l).toLowerCase().startsWith(`${label.toLowerCase()} *`));
  if (!match) return null;
  const id = match.getAttribute('for');
  if (id === null) return null;
  const el = container.querySelector<HTMLInputElement>(`[id="${id}"]`);
  return el;
}

export function textareaByLabel(container: ParentNode, label: string): HTMLTextAreaElement | null {
  const labels = Array.from(container.querySelectorAll('label'));
  const match = labels.find((l) => text(l).toLowerCase() === label.toLowerCase());
  if (!match) return null;
  const id = match.getAttribute('for');
  if (id === null) return null;
  return container.querySelector<HTMLTextAreaElement>(`[id="${id}"]`);
}

/** Submit the form a button belongs to, as Enter would. */
export async function submitForm(container: ParentNode, formTestId: string): Promise<void> {
  const form = container.querySelector<HTMLFormElement>(`[data-testid="${formTestId}"]`);
  if (form === null) throw new Error(`submitForm: no form ${formTestId}`);
  await act(async () => {
    form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

export function activeElement(): Element | null {
  return win.document.activeElement;
}

export { win };
