import { installDomGlobal } from './dom.js';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { act, Simulate } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Routes } from '../router.js';
import type { RouteDef } from '../router.js';
import { ConsoleFrame } from '../layout/console-frame.js';
import { allCapabilitiesSession, impersonatingSession, NOW, reviewerSession } from './fixtures.js';

const HOME = Routes.find((route) => route.path === '/')!;
const roots: Root[] = [];

function mount(session = allCapabilitiesSession(), route: RouteDef = HOME): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      <ConsoleFrame route={route} session={session} now={NOW}>
        <section data-page="page">
          <input data-testid="outside-input" aria-label="Filter rows" />
        </section>
      </ConsoleFrame>,
    );
  });
  return host;
}

function press(key: string, target: EventTarget = window, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function openPalette(): HTMLElement {
  act(() => {
    press('?');
  });
  const palette = document.querySelector<HTMLElement>('[data-testid="command-palette"]');
  expect(palette).not.toBeNull();
  return palette!;
}

function paletteInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('.ops-palette-input');
  expect(input).not.toBeNull();
  return input!;
}

beforeEach(() => {
  installDomGlobal();
  window.history.replaceState({}, '', '/');
  localStorage.clear();
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
  window.history.replaceState({}, '', '/');
});

describe('command palette', () => {
  it('opens on ? and lists only destinations this session may see', () => {
    mount(reviewerSession());
    const palette = openPalette();
    expect(palette.getAttribute('role')).toBe('dialog');
    expect(palette.getAttribute('aria-label')).toBe('Command palette');
    const links = Array.from(palette.querySelectorAll('a')).map((anchor) => ({
      href: anchor.getAttribute('href'),
      label: (anchor.textContent ?? '').trim(),
    }));
    expect(links).toEqual([{ href: '/', label: 'Review queue/' }]);
    expect(palette.textContent).not.toContain('Payout ops');
    expect(palette.textContent).not.toContain('Audit trail');
  });

  it('moves focus into the palette and restores the opener on Escape', () => {
    const host = mount();
    const commands = Array.from(host.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('Commands'),
    );
    expect(commands).toBeDefined();
    act(() => commands!.focus());
    openPalette();
    expect(document.activeElement).toBe(paletteInput());
    expect(commands?.getAttribute('aria-expanded')).toBe('true');

    act(() => {
      press('Escape', paletteInput());
    });
    expect(document.querySelector('[data-testid="command-palette"]')).toBeNull();
    expect(document.activeElement).toBe(commands);
    expect(commands?.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not trap Tab inside the palette', () => {
    mount();
    openPalette();
    let event: KeyboardEvent | null = null;
    act(() => {
      event = press('Tab', paletteInput());
    });
    expect(event!.defaultPrevented).toBe(false);
  });

  it('filters the permitted list and says when nothing matches', () => {
    mount();
    openPalette();
    const input = paletteInput();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setValue.call(input, 'payout');
      // Simulate, not a dispatched `input`: react-dom's module-init DOM snapshot leaves its
      // ChangeEventPlugin on the pre-`input` branch here, so a dispatched event never reaches
      // `onChange` and the palette would filter an empty query.
      Simulate.change(input);
    });
    const palette = document.querySelector('[data-testid="command-palette"]')!;
    expect(palette.textContent).toContain('Payout ops');
    expect(palette.textContent).not.toContain('Audit trail');

    act(() => {
      setValue.call(input, 'zzzz');
      Simulate.change(input);
    });
    expect(palette.textContent).toContain('No section matches');
  });
});

describe('navigation shortcuts', () => {
  it('navigates on a g-chord only when the destination is visible', () => {
    mount(reviewerSession());
    window.history.replaceState({}, '', '/sign-in');
    act(() => {
      press('g');
      press('p');
    });
    expect(window.location.pathname).toBe('/sign-in');

    act(() => {
      press('g');
      press('q');
    });
    expect(window.location.pathname).toBe('/');
  });

  it('navigates to a permitted section on its chord', () => {
    mount(allCapabilitiesSession());
    act(() => {
      press('g');
      press('p');
    });
    expect(window.location.pathname).toBe('/payouts');
  });

  it('refuses critical chords during impersonation but keeps ordinary ones', () => {
    mount(impersonatingSession());
    act(() => {
      press('g');
      press('p');
    });
    expect(window.location.pathname).toBe('/');
    act(() => {
      press('g');
      press('a');
    });
    expect(window.location.pathname).toBe('/');

    act(() => {
      press('g');
      press('d');
    });
    expect(window.location.pathname).toBe('/disputes');
  });

  it('ignores shortcuts while the operator is typing in a field', () => {
    const host = mount();
    const input = host.querySelector<HTMLInputElement>('[data-testid="outside-input"]')!;
    act(() => input.focus());
    act(() => {
      press('g', input);
      press('p', input);
      press('?', input);
    });
    expect(window.location.pathname).toBe('/');
    expect(document.querySelector('[data-testid="command-palette"]')).toBeNull();
  });

  it('does not intercept plain typing or modifier chords', () => {
    mount();
    let g: KeyboardEvent | null = null;
    let modified: KeyboardEvent | null = null;
    act(() => {
      g = press('g');
      modified = press('p', window, { ctrlKey: true });
    });
    expect(g!.defaultPrevented).toBe(false);
    expect(modified!.defaultPrevented).toBe(false);
    expect(window.location.pathname).toBe('/');
  });
});
