import './dom-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { win } from './dom-setup.js';
import { Modal } from '../overlay/modal.js';

let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
});

function renderModal(onClose: () => void, open: boolean) {
  const tree = (
    <Modal open={open} onClose={onClose} title="Cancel order">
      <button type="button">First</button>
      <button type="button">Last</button>
    </Modal>
  );
  return tree;
}

function openModal(onClose: (n?: number) => void) {
  const opener = document.createElement('button');
  opener.textContent = 'Cancel order';
  document.body.appendChild(opener);
  opener.focus();

  Object.defineProperty(win, 'scrollY', { value: 240, configurable: true });
  const scrollToCalls: Array<[number, number]> = [];
  (win as unknown as { scrollTo: (x: number, y: number) => void }).scrollTo = (x, y) => {
    scrollToCalls.push([x, y]);
  };

  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  return { opener, host, scrollToCalls, render: (open: boolean) => act(async () => void root!.render(renderModal(() => onClose(), open))) };
}

describe('Modal', () => {
  it('traps Tab/Shift+Tab, marks the background inert, and returns focus to the opener on close', async () => {
    let closeCalls = 0;
    const { opener, host, scrollToCalls, render } = openModal(() => closeCalls++);
    await render(true);

    const panel = document.querySelector('[role="dialog"]') as HTMLElement | null;
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('aria-modal')).toBe('true');
    expect(panel!.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.activeElement).toBe(panel);

    // Negative fixture for the inert rule: the React root and the opener ARE inert; the panel
    // and its host are NOT. If this ever inverts, the dialog locks itself out of its own page.
    expect(host.hasAttribute('inert')).toBe(true);
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(opener.hasAttribute('inert')).toBe(true);
    const overlayHost = document.querySelector('[data-ds-overlay-host]');
    expect(overlayHost!.hasAttribute('inert')).toBe(false);
    expect(panel!.hasAttribute('inert')).toBe(false);

    // Scroll lock is the iOS-safe pin, and it unwinds on close including the saved offset.
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-240px');

    const buttons = Array.from(panel!.querySelectorAll('button'));
    expect(buttons.length).toBe(2);

    // Tab order: forward wrap from the last control lands on the first.
    buttons[1]!.focus();
    await act(async () => {
      buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[0]);

    // Shift+Tab from the first lands on the last.
    await act(async () => {
      buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[1]);

    await act(async () => {
      panel!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(closeCalls).toBe(1);

    await render(false);
    expect(document.activeElement).toBe(opener);
    expect(host.hasAttribute('inert')).toBe(false);
    expect(opener.hasAttribute('inert')).toBe(false);
    expect(document.body.style.position).toBe('');
    expect(scrollToCalls).toContainEqual([0, 240]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('clicking the scrim closes; the panel itself does not swallow the veil click', async () => {
    let closed = 0;
    const { render } = openModal(() => closed++);
    await render(true);
    const scrim = document.querySelector('[data-scrim]') as HTMLElement;
    expect(scrim.getAttribute('aria-hidden')).toBe('true');
    await act(async () => {
      scrim.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(closed).toBe(1);
  });

  it('unmounting while open restores focus and un-inerts the page (route change, not close)', async () => {
    const { opener, host, render } = openModal(() => {});
    await render(true);
    expect(host.hasAttribute('inert')).toBe(true);
    await act(async () => {
      root!.unmount();
      root = null;
    });
    expect(host.hasAttribute('inert')).toBe(false);
    expect(document.body.style.position).toBe('');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // The overlay host belongs to the unmounted tree; nothing may stay behind.
    expect(document.querySelectorAll('[data-ds-overlay-host]').length).toBe(0);
    expect(opener.isConnected).toBe(true);
  });

  it('a re-render with a fresh onClose closure does not yank focus back to the panel', async () => {
    const { render } = openModal(() => {});
    await render(true);
    const panel = document.querySelector('[role="dialog"]') as HTMLElement;
    const buttons = Array.from(panel.querySelectorAll('button'));
    buttons[0]!.focus();
    await render(true); // parent re-rendered with a new lambda; focus must stay put
    expect(document.activeElement).toBe(buttons[0]);
  });
});
