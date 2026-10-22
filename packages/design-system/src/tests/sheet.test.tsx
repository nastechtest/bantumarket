import './dom-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { win } from './dom-setup.js';
import { Sheet } from '../sheet.js';

let lastRoot: Root | null = null;

afterEach(() => {
  lastRoot = null;
  document.body.innerHTML = '';
  // The scroll lock writes inline styles onto <body>; a test that closes without unmounting
  // must not leak `position:fixed` into the next one's "previous" snapshot.
  document.body.removeAttribute('style');
});

function sheetTree(onClose: () => void, open = true) {
  return (
    <Sheet open={open} onClose={onClose} title="Filters">
      <button type="button">First</button>
      <button type="button">Last</button>
    </Sheet>
  );
}

describe('Sheet', () => {
  it('traps focus, marks the background inert, locks scroll, and restores everything on close', async () => {
    const doc = document;
    const opener = doc.createElement('button');
    opener.textContent = 'Open filters';
    doc.body.appendChild(opener);
    opener.focus();

    Object.defineProperty(win, 'scrollY', { value: 120, configurable: true });
    const scrollToCalls: Array<[number, number]> = [];
    (win as unknown as { scrollTo: (x: number, y: number) => void }).scrollTo = (x, y) => {
      scrollToCalls.push([x, y]);
    };

    const host = doc.createElement('div');
    doc.body.appendChild(host);
    let closeCalls = 0;
    const root = createRoot(host);
    lastRoot = root;

    await act(async () => {
      root.render(sheetTree(() => closeCalls++));
    });

    const panel = doc.querySelector('[role="dialog"]') as HTMLElement | null;
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('aria-modal')).toBe('true');
    expect(panel!.getAttribute('aria-labelledby')).toBeTruthy();
    expect(panel!.contains(doc.activeElement)).toBe(true); // panel itself is the initial focus

    // The background — the React root and the opener — is inert and hidden; the panel is not.
    expect(host.hasAttribute('inert')).toBe(true);
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(opener.hasAttribute('inert')).toBe(true);
    expect(panel!.hasAttribute('inert')).toBe(false);

    // iOS-safe scroll lock: the body is pinned at the negative offset, not merely overflow:hidden.
    expect(doc.body.style.position).toBe('fixed');
    expect(doc.body.style.top).toBe('-120px');

    const buttons = Array.from(panel!.querySelectorAll('button'));
    expect(buttons.length).toBe(2);

    // Tab at the last control wraps to the first; Shift+Tab at the first wraps to the last.
    buttons[1]!.focus();
    await act(async () => {
      buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(doc.activeElement).toBe(buttons[0]);

    await act(async () => {
      buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    });
    expect(doc.activeElement).toBe(buttons[1]);

    // Escape closes.
    await act(async () => {
      panel!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(closeCalls).toBe(1);

    // Close restores focus to the opener, un-inerts the page, and scrolls back to the saved
    // offset — the jump-free half of the iOS lock.
    await act(async () => {
      root.render(sheetTree(() => closeCalls++, false));
    });
    expect(doc.activeElement).toBe(opener);
    expect(host.hasAttribute('inert')).toBe(false);
    expect(opener.hasAttribute('inert')).toBe(false);
    expect(doc.body.style.position).toBe('');
    expect(scrollToCalls).toContainEqual([0, 120]);
    expect(doc.querySelectorAll('.ds-sheet-root').length).toBe(0);
  });

  it('taps on the scrim close the sheet', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let closed = 0;
    const root = createRoot(host);
    lastRoot = root;
    await act(async () => {
      root.render(sheetTree(() => closed++));
    });
    const panel = document.querySelector('[role="dialog"]') as HTMLElement;
    const scrim = panel.parentElement?.firstElementChild as HTMLElement;
    expect(scrim.getAttribute('aria-hidden')).toBe('true');
    await act(async () => {
      scrim.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(closed).toBe(1);
  });

  it('restores the page when it is unmounted while open (route change, not just close)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    lastRoot = root;
    await act(async () => {
      root.render(sheetTree(() => {}));
    });
    expect(host.hasAttribute('inert')).toBe(true);
    await act(async () => {
      root.unmount();
    });
    expect(host.hasAttribute('inert')).toBe(false);
    expect(document.body.style.position).toBe('');
    expect(document.querySelectorAll('.ds-sheet-root').length).toBe(0);
  });
});
