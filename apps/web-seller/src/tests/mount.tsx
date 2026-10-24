import './dom-setup.js';
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { win } from './dom-setup.js';

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
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    async rerender(next) {
      await act(() => {
        root.render(next);
      });
    },
    unmount() {
      void act(() => root.unmount());
      container.remove();
    },
  };
}

export function textOf(container: HTMLElement): string {
  return container.textContent ?? '';
}

export async function click(element: Element): Promise<void> {
  await act(() => {
    element.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** A matchMedia stub the media-query hook can actually subscribe to and whose value can flip. */
export function stubMatchMedia(initial: boolean): { flip(matches: boolean): void } {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    get matches() {
      return matches;
    },
    media: '',
    onchange: null,
    addEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) {
      listeners.delete(listener);
    },
    addListener(listener: (event: MediaQueryListEvent) => void) {
      listeners.add(listener);
    },
    removeListener(listener: (event: MediaQueryListEvent) => void) {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  };
  Object.defineProperty(win, 'matchMedia', {
    configurable: true,
    value: () => media,
  });
  return {
    flip(next) {
      matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}
