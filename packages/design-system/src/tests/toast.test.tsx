import './dom-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { setReducedMotionOverride } from '@nastech/motion';
import { ToastViewport } from '../feedback/toast.js';
import { createToastStore, MAX_VISIBLE } from '../feedback/toast-store.js';
import { entranceAnimation } from '../overlay/anim.js';

let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = '';
  setReducedMotionOverride(null);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('toast store', () => {
  it('notifies subscribers and keeps snapshot identity stable between mutations', () => {
    const store = createToastStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => (calls += 1));
    expect(store.getSnapshot()).toEqual([]);
    const firstRead = store.getSnapshot();

    store.push({ tone: 'info', title: 'Listing published' });
    expect(calls).toBe(1);
    expect(store.getSnapshot()).not.toBe(firstRead);
    expect(store.getSnapshot()).toBe(store.getSnapshot()); // same reference until next mutation

    store.push({ tone: 'positive', title: 'Handover confirmed' });
    expect(calls).toBe(2);
    expect(store.getSnapshot().length).toBe(2);
    unsubscribe();
    store.push({ tone: 'info', title: 'after unsubscribe' });
    expect(calls).toBe(2);
  });

  it('negative toasts are assertive by default; others polite; explicit wins', () => {
    const store = createToastStore();
    expect(store.push({ tone: 'negative', title: 'Payment failed' }).assertive).toBe(true);
    expect(store.push({ tone: 'info', title: 'Draft saved' }).assertive).toBe(false);
    expect(store.push({ tone: 'info', title: 'Look at me', assertive: true }).assertive).toBe(true);
  });

  it('evicts the oldest past the cap so the newest fact is always on screen', () => {
    const store = createToastStore();
    const pushed = Array.from({ length: MAX_VISIBLE + 2 }, (_, i) =>
      store.push({ tone: 'info', title: `t${i}` }),
    );
    const snapshot = store.getSnapshot();
    expect(snapshot.length).toBe(MAX_VISIBLE);
    expect(snapshot.map((t) => t.title)).toEqual(['t2', 't3', 't4', 't5']);
    expect(store.dismiss(pushed[0]!.id)).toBe(false); // already evicted
    expect(store.dismiss(pushed[5]!.id)).toBe(true);
    expect(store.getSnapshot().map((t) => t.title)).toEqual(['t2', 't3', 't4']);
  });
});

describe('ToastViewport', () => {
  it('renders a negative toast as role=alert and an info toast as role=status, dismissable', async () => {
    const store = createToastStore();
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<ToastViewport store={store} ttlMs={10_000_000} />);
    });
    expect(document.querySelector('[role="alert"]')).toBeNull(); // nothing yet — no empty live region

    await act(async () => {
      store.push({ tone: 'negative', title: 'Payment failed', body: 'The bank did not authorise R4,200.' });
      store.push({ tone: 'info', title: 'Draft saved' });
    });

    const alert = document.querySelector('[role="alert"]');
    const status = document.querySelector('[role="status"]');
    expect(alert?.textContent).toContain('Payment failed');
    expect(alert?.textContent).toContain('The bank did not authorise R4,200.');
    expect(status?.textContent).toContain('Draft saved');

    const dismiss = document.querySelector('[role="alert"] button') as HTMLButtonElement;
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss notification: Payment failed');
    await act(async () => {
      dismiss.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[role="status"]')).not.toBeNull();
  });

  it('auto-dismisses on the ttl', async () => {
    const store = createToastStore();
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<ToastViewport store={store} ttlMs={20} />);
      store.push({ tone: 'info', title: 'Short lived' });
    });
    expect(document.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => {
      await sleep(120);
    });
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it('reduced motion drops the entrance animation but never the toast', async () => {
    const store = createToastStore();
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    setReducedMotionOverride(true);
    await act(async () => {
      root!.render(<ToastViewport store={store} ttlMs={10_000_000} />);
      store.push({ tone: 'positive', title: 'Handover confirmed' });
    });
    const panel = document.querySelector('[role="status"]');
    expect(panel).not.toBeNull(); // the state change is still announced — motion never carries it
    // The gate itself, asserted on the shared primitive the viewport composes: under reduction
    // there is no animation value to apply, so nothing fades the toast in or hides it.
    expect(entranceAnimation('ds-panel-rise-in')).toBeUndefined();

    setReducedMotionOverride(false);
    await act(async () => {
      store.push({ tone: 'positive', title: 'Re-rendered brand' });
    });
    expect(store.getSnapshot().map((t) => t.title)).toContain('Re-rendered brand');
    expect(document.querySelectorAll('[role="status"]').length).toBe(2);
    expect(entranceAnimation('ds-panel-rise-in')).toContain('ds-panel-rise-in');
  });
});
