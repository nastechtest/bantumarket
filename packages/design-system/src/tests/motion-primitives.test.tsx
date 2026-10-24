import { afterEach, describe, expect, it } from 'bun:test';
import { act } from 'react';
import { cleanup, installDom, render } from '@nastech/testing';
import { setReducedMotionOverride } from '@nastech/motion';
import { PageTransition } from '../motion/page-transition.js';
import { Skeleton } from '../motion/skeleton.js';
import { Spinner } from '../motion/spinner.js';
import { Toast } from '../motion/toast.js';

installDom();

afterEach(() => {
  cleanup();
  setReducedMotionOverride(null);
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Skeleton', () => {
  it('is aria-hidden, shimmers, and points at a visually hidden Loading label', () => {
    const view = render(<Skeleton height="2rem" />);
    const block = view.container.querySelector<HTMLElement>('[data-ds-skeleton]');
    expect(block).not.toBeNull();
    expect(block!.getAttribute('aria-hidden')).toBe('true');
    expect(block!.className).toContain('motion-skeleton-shimmer');

    const labelId = block!.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    // Use the block's own document: other suites replace the globals in a shared bun process.
    const label = block!.ownerDocument.getElementById(labelId!);
    expect(label?.textContent).toBe('Loading');
    expect(label?.style.clipPath).toBe('inset(50%)');
  });

  it('drops the shimmer under reduced motion but keeps the placeholder and label', () => {
    setReducedMotionOverride(true);
    const view = render(<Skeleton />);
    const block = view.container.querySelector<HTMLElement>('[data-ds-skeleton]');
    expect(block?.className).not.toContain('motion-skeleton-shimmer');
    expect(view.container.textContent).toContain('Loading');
  });
});

describe('Spinner', () => {
  it('is a polite live region from first paint with an accessible label', () => {
    const view = render(<Spinner />);
    const region = view.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toContain('Loading');
    expect(region.querySelector('.motion-spinner')).not.toBeNull();
  });

  it('stays announced and visible under reduced motion, without the rotation', () => {
    setReducedMotionOverride(true);
    const view = render(<Spinner label="Loading listings" />);
    const region = view.getByRole('status');
    expect(region.textContent).toContain('Loading listings');
    expect(region.querySelector('.motion-spinner')).toBeNull();
  });
});

describe('PageTransition', () => {
  it('renders children immediately and applies the enter class', () => {
    const view = render(
      <PageTransition>
        <p>Orders</p>
      </PageTransition>,
    );
    const wrapper = view.container.querySelector<HTMLElement>('[data-ds-motion="page-transition"]');
    expect(wrapper?.textContent).toContain('Orders');
    expect(wrapper?.className).toContain('motion-page-enter');
    expect(wrapper?.getAttribute('data-animating')).toBe('true');
  });

  it('respects reduced motion: no class, same content', () => {
    setReducedMotionOverride(true);
    const view = render(
      <PageTransition>
        <p>Orders</p>
      </PageTransition>,
    );
    const wrapper = view.container.querySelector<HTMLElement>('[data-ds-motion="page-transition"]');
    expect(wrapper?.textContent).toContain('Orders');
    expect(wrapper?.className).not.toContain('motion-page-enter');
    expect(wrapper?.getAttribute('data-animating')).toBe('false');
  });
});

describe('Toast', () => {
  it('is role=status with an enter class and a labelled dismiss action', async () => {
    let dismissed = 0;
    const view = render(
      <Toast
        title="Listing published"
        body="Buyers can see it now."
        autoDismissMs={0}
        onDismiss={() => (dismissed += 1)}
      />,
    );
    const toast = view.getByRole('status');
    expect(toast.textContent).toContain('Listing published');
    expect(toast.className).toContain('motion-toast-in');

    const button = view.container.querySelector<HTMLButtonElement>('button');
    expect(button?.getAttribute('aria-label')).toBe('Dismiss notification: Listing published');
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(dismissed).toBe(1);
    expect(view.container.querySelector('[role="status"]')).toBeNull();
  });

  it('creates no auto-dismiss timer when reduced motion is set', () => {
    setReducedMotionOverride(true);
    const original = globalThis.setTimeout;
    const delays: number[] = [];
    globalThis.setTimeout = ((...args: unknown[]) => {
      if (typeof args[1] === 'number') delays.push(args[1]);
      return (original as (...inner: unknown[]) => unknown)(...args);
    }) as typeof setTimeout;

    try {
      const view = render(<Toast title="Handover confirmed" autoDismissMs={7} />);
      expect(view.getByRole('status').textContent).toContain('Handover confirmed');
    } finally {
      globalThis.setTimeout = original;
    }

    expect(delays).not.toContain(7);
  });

  it('auto-dismisses on the TTL when motion is allowed', async () => {
    const view = render(<Toast title="Short lived" autoDismissMs={15} />);
    expect(view.container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => {
      await sleep(80);
    });
    expect(view.container.querySelector('[role="status"]')).toBeNull();
  });
});
