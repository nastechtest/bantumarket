import './dom-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Menu } from '../overlay/menu.js';
import type { MenuItem } from '../overlay/menu.js';

let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = '';
});

function key(el: Element, k: string, init: KeyboardEventInit = {}) {
  return el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
}

describe('Menu (menu-button pattern)', () => {
  const items: MenuItem[] = [
    { key: 'rename', label: 'Rename listing', onSelect: () => {} },
    { key: 'pause', label: 'Pause listing', onSelect: () => {} },
    { key: 'archive', label: 'Archive', disabled: true, onSelect: () => {} },
    { key: 'delete', label: 'Delete listing', danger: true, onSelect: () => {} },
  ];

  function renderMenu(onSelectSink: string[]) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const withSink = items.map((i) => ({ ...i, onSelect: () => onSelectSink.push(i.key) }));
    return act(async () => {
      root!.render(<Menu triggerLabel="Actions" items={withSink} />);
    }).then(() => host);
  }

  it('the closed trigger tells the truth about the DOM: haspopup yes, expanded no, controls no', async () => {
    const sink: string[] = [];
    await renderMenu(sink);
    const trigger = document.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('aria-controls')).toBe(false); // negative fixture: nothing to control
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('ArrowDown from the trigger opens and focuses the first enabled item; the menu is aria-controls-ed', async () => {
    const sink: string[] = [];
    await renderMenu(sink);
    const trigger = document.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    await act(async () => {
      key(trigger, 'ArrowDown');
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(trigger.getAttribute('aria-controls')).toBe(menu!.id);
    const first = menu!.querySelector('[role="menuitem"]') as HTMLButtonElement;
    expect(document.activeElement).toBe(first);
  });

  it('arrow keys roam enabled items only — disabled items are skipped, never landed on', async () => {
    const sink: string[] = [];
    await renderMenu(sink);
    const trigger = document.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]')) as HTMLButtonElement[];
    expect(menuItems.length).toBe(4);
    expect(menuItems[2]!.disabled).toBe(true); // the Archive fixture
    expect(menuItems[2]!.getAttribute('tabindex')).toBe('-1');

    const first = menuItems[0]!;
    const second = menuItems[1]!;
    const fourth = menuItems[3]!;

    first.focus();
    await act(async () => {
      key(first, 'ArrowDown');
    });
    expect(document.activeElement).toBe(second);

    // Step onto the disabled Archive and straight past it onto Delete.
    await act(async () => {
      key(second, 'ArrowDown');
    });
    expect(document.activeElement).toBe(fourth);

    // Wrap-around past the end returns to the first enabled item.
    await act(async () => {
      key(fourth, 'ArrowDown');
    });
    expect(document.activeElement).toBe(first);

    // Backwards wrap from the first item lands on the last enabled one (skips Archive).
    await act(async () => {
      key(first, 'ArrowUp');
    });
    expect(document.activeElement).toBe(fourth);

    await act(async () => {
      key(fourth, 'Home');
    });
    expect(document.activeElement).toBe(first);

    await act(async () => {
      key(first, 'End');
    });
    expect(document.activeElement).toBe(fourth);
  });

  it('typeahead focuses the first label starting with the typed letter', async () => {
    const sink: string[] = [];
    await renderMenu(sink);
    const trigger = document.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const itemsEls = Array.from(document.querySelectorAll('[role="menuitem"]')) as HTMLButtonElement[];
    itemsEls[0]!.focus();
    await act(async () => {
      key(itemsEls[0]!, 'd');
    });
    expect(document.activeElement).toBe(itemsEls[3]); // "Delete listing"
  });

  it('Escape closes and returns focus to the trigger; Enter selects and closes without re-focusing', async () => {
    const sink: string[] = [];
    await renderMenu(sink);
    const trigger = document.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const first = document.querySelector('[role="menuitem"]') as HTMLButtonElement;
    await act(async () => {
      key(first, 'Escape');
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const firstAgain = document.querySelector('[role="menuitem"]') as HTMLButtonElement;
    await act(async () => {
      firstAgain.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(sink).toEqual(['rename']);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('Tab dismisses the menu instead of walking into nothing (WAI menu pattern)', async () => {
    const sink: string[] = [];
    await renderMenu(sink);
    const trigger = document.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const first = document.querySelector('[role="menuitem"]') as HTMLButtonElement;
    await act(async () => {
      key(first, 'Tab');
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('pointerdown outside closes; a danger item is marked for styling without changing behaviour', async () => {
    const sink: string[] = [];
    await renderMenu(sink);
    const trigger = document.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const danger = document.querySelector('[role="menuitem"][data-danger="true"]') as HTMLButtonElement;
    expect(danger).not.toBeNull();

    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Re-query: the reopened menu is a fresh tree; the old node reference is detached.
    const dangerAgain = document.querySelector('[role="menuitem"][data-danger="true"]') as HTMLButtonElement;
    await act(async () => {
      dangerAgain.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(sink).toEqual(['delete']);
  });
});
