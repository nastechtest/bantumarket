import './dom-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { activateFocusTrap, FOCUSABLE_SELECTOR } from '../overlay/focus-trap.js';

/**
 * The trap tested head-on against a synthetic DOM: no React, no portal — if the tab ring, the
 * inert sweep and the focus return work here, every overlay that composes `activateFocusTrap`
 * inherits a proven primitive rather than a per-component copy of it.
 */

function buildPanel(withControls: boolean): HTMLElement {
  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.tabIndex = -1;
  if (withControls) {
    for (const label of ['First', 'Last']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      panel.appendChild(b);
    }
  }
  document.body.appendChild(panel);
  return panel;
}

const realBody = () => document.body;

afterEach(() => {
  document.body.innerHTML = '';
});

function tab(key: 'Tab', shift = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

describe('activateFocusTrap', () => {
  it('inerts the background except the panel, focuses the panel, and reverses both on deactivate', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const panel = buildPanel(true);

    const trap = activateFocusTrap(panel);
    expect(document.activeElement).toBe(panel);
    expect(realBody().children[0]).toBe(opener);
    expect(opener.hasAttribute('inert')).toBe(true);
    expect(opener.getAttribute('aria-hidden')).toBe('true');
    expect(panel.hasAttribute('inert')).toBe(false);

    trap.deactivate();
    expect(opener.hasAttribute('inert')).toBe(false);
    expect(opener.getAttribute('aria-hidden')).toBe(null);
    expect(document.activeElement).toBe(opener);
  });

  it('Tab wraps last→first and Shift+Tab wraps first→last; disabled controls are not focusables', () => {
    const panel = buildPanel(true);
    const trap = activateFocusTrap(panel);
    const [first, last] = Array.from(panel.querySelectorAll('button'));

    last!.focus();
    tab('Tab');
    expect(document.activeElement).toBe(first);

    tab('Tab', true);
    expect(document.activeElement).toBe(last);

    // A disabled button is not in the ring at all — the selector itself excludes it.
    const disabled = document.createElement('button');
    disabled.disabled = true;
    panel.appendChild(disabled);
    last!.focus();
    tab('Tab');
    expect(document.activeElement).toBe(first);
    expect(panel.querySelectorAll(FOCUSABLE_SELECTOR).length).toBe(2);

    trap.deactivate();
  });

  it('an empty trap holds focus instead of leaking Tab into the inerted background', () => {
    const panel = buildPanel(false);
    const trap = activateFocusTrap(panel);
    expect(document.activeElement).toBe(panel);
    const event = tab('Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(panel);
    trap.deactivate();
  });

  it('Escape calls onEscape and does nothing else; other keys pass through', () => {
    let escapes = 0;
    const panel = buildPanel(true);
    const trap = activateFocusTrap(panel, { onEscape: () => (escapes += 1) });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    expect(escapes).toBe(0);

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(escapes).toBe(1);
    expect(event.defaultPrevented).toBe(true);
    trap.deactivate();
  });

  it('initialFocus wins over the panel; a removed opener is not resurrected on deactivate', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const panel = buildPanel(true);
    const [first] = Array.from(panel.querySelectorAll('button'));
    const trap = activateFocusTrap(panel, { initialFocus: first! });
    expect(document.activeElement).toBe(first);

    // Negative fixture: the opener unmounts while the dialog is open (a tab closed under it).
    // Deactivation must not throw, and must not focus a detached node.
    document.body.removeChild(opener);
    expect(() => trap.deactivate()).not.toThrow();
    expect(document.activeElement).not.toBe(opener);

    // A second deactivate is a no-op, not a double focus-restore.
    trap.deactivate();
  });

  it('focus started outside the panel is pulled in by the next Tab', () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    const panel = buildPanel(true);
    const trap = activateFocusTrap(panel);
    const [first] = Array.from(panel.querySelectorAll('button'));

    outside.focus();
    tab('Tab');
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(first);
    trap.deactivate();
  });
});
