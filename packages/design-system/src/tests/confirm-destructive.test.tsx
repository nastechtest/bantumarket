import './dom-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmDestructive, confirmDestructive } from '../patterns/confirm-destructive.js';

let closeFns: Array<() => Promise<void>> = [];

afterEach(async () => {
  const fns = closeFns;
  closeFns = [];
  for (const fn of fns) await fn();
  document.body.innerHTML = '';
});

function openConfirm(sink: { confirmed: number; cancelled: number }) {
  const tree = (
    <ConfirmDestructive
      title="Cancel this order"
      consequences={[
        'The buyer loses the R4,200 hold.',
        'This cannot be undone — the order goes to CANCELLED.',
      ]}
      confirmLabel="Cancel the order"
      onConfirm={() => (sink.confirmed += 1)}
      onCancel={() => (sink.cancelled += 1)}
    />
  );
  return tree;
}

async function mount(tree: ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  closeFns.push(() => act(async () => root.unmount()));
  await act(async () => {
    root.render(tree);
  });
  return host;
}

describe('ConfirmDestructive (controlled)', () => {
  it('is an alertdialog whose confirm control stays disabled until every consequence is affirmed', async () => {
    const sink = { confirmed: 0, cancelled: 0 };
    await mount(openConfirm(sink));
    // Modal portals to document.body (the dialog owns the top stacking context), so query there.
    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(boxes.length).toBe(2);
    const confirm = document.querySelector('[data-confirm-destructive]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(sink.confirmed).toBe(0);

    // Affirm one of two — the wall holds. This is the negative fixture: partial acknowledgement
    // must not unlock the action.
    // React drives a checkbox's onChange from the native click event, so click the control the way a
    // user does instead of dispatching a bare `change` event React never maps to onChange.
    await act(async () => {
      boxes[0]!.click();
    });
    expect(confirm.disabled).toBe(true);

    await act(async () => {
      boxes[1]!.click();
    });
    expect(confirm.disabled).toBe(false);

    await act(async () => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(sink.confirmed).toBe(1);

    // Un-affirming re-locks the wall.
    await act(async () => {
      boxes[0]!.click();
    });
    const confirmAgain = document.querySelector('[data-confirm-destructive]') as HTMLButtonElement;
    expect(confirmAgain.disabled).toBe(true);
  });

  it('Escape and Cancel are the same single cancel path — never a confirmation', async () => {
    const sink = { confirmed: 0, cancelled: 0 };
    await mount(openConfirm(sink));
    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement;
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(sink.cancelled).toBe(1);
    expect(sink.confirmed).toBe(0);

    const cancel = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Cancel') as HTMLButtonElement;
    await act(async () => {
      cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(sink.cancelled).toBe(2);
  });
});

describe('confirmDestructive (promise form)', () => {
  it('resolves only on confirm; cancel tears the dialog down and the promise stays pending', async () => {
    let settled = false;
    const promise = confirmDestructive({
      title: 'Delete listing',
      consequences: ['Photos and captions are removed permanently.'],
      confirmLabel: 'Delete it',
    }).then((value) => {
      settled = true;
      return value;
    });

    await act(async () => {
      await Promise.resolve();
    });
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    const confirm = dialog!.querySelector('[data-confirm-destructive]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    // Cancel path: dialog gone, promise unresolvable — the caller never proceeds.
    const cancel = Array.from(dialog!.querySelectorAll('button')).find((b) => b.textContent === 'Cancel') as HTMLButtonElement;
    await act(async () => {
      cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(document.querySelector('[data-ds-confirm-destructive-host]')).toBeNull();
    expect(settled).toBe(false);

    // Confirm path on a fresh call: affirm the consequence, click through, promise resolves true.
    const confirmed = confirmDestructive({
      title: 'Delete listing',
      consequences: ['Photos and captions are removed permanently.'],
      confirmLabel: 'Delete it',
    });
    await act(async () => {
      await Promise.resolve();
    });
    const dialog2 = document.querySelector('[role="alertdialog"]') as HTMLElement;
    const box = dialog2.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      box.click();
    });
    const confirm2 = dialog2.querySelector('[data-confirm-destructive]') as HTMLButtonElement;
    expect(confirm2.disabled).toBe(false);
    await act(async () => {
      confirm2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const outcome = await Promise.race([confirmed, new Promise((r) => setTimeout(() => r('pending'), 50))]);
    expect(outcome).toBe(true);
    expect(promise).toBeInstanceOf(Promise);
  });
});
