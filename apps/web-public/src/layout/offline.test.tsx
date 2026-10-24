import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buyDisabledReason,
  createOnlineStore,
  offlineBannerCopy,
  OFFLINE_HEADLINE,
  type OnlineSource,
} from '../lib/online-status.js';
import { StickyBuyBarSlot } from './sticky-buy-bar-slot.js';

function fakeSource(initial: boolean): OnlineSource & { emit: (v: boolean) => void } {
  let handler: ((v: boolean) => void) | null = null;
  return {
    initial: () => initial,
    subscribe(h) {
      handler = h;
      return () => {
        handler = null;
      };
    },
    emit: (v) => handler?.(v),
  };
}

describe('online status store', () => {
  it('follows the source, notifies listeners once per actual change', () => {
    const src = fakeSource(true);
    const store = createOnlineStore(src);
    let calls = 0;
    store.subscribe(() => calls++);

    src.emit(true); // no change
    expect(store.get()).toBe(true);
    src.emit(false);
    expect(store.get()).toBe(false);
    expect(calls).toBe(1);

    // A failed request can correct the hint — this is `set(false)`, the transport's hook.
    store.set(false);
    expect(calls).toBe(1);
    store.set(true);
    expect(store.get()).toBe(true);
    expect(calls).toBe(2);
    store.dispose();
    src.emit(false);
    expect(store.get()).toBe(true);
  });
});

describe('honest offline copy', () => {
  it('says the headline and never promises queued work', () => {
    const reason = buyDisabledReason(false);
    expect(reason).not.toBeNull();
    expect(reason).toContain(OFFLINE_HEADLINE);
    expect(reason).toContain('do not queue');
    expect(buyDisabledReason(true)).toBeNull();

    const banner = offlineBannerCopy(false);
    expect(banner).toContain(OFFLINE_HEADLINE);
    expect(offlineBannerCopy(true)).toBeNull();
  });
});

describe('sticky buy bar', () => {
  it('offline: present, disabled, aria-wired to a written reason — a visible "not silently"', () => {
    const markup = renderToStaticMarkup(
      <StickyBuyBarSlot online={false} priceLabel="R4,200" label="Buy now" />,
    );
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('aria-describedby="nt-buybar-offline-reason"');
    expect(markup).toContain('We do not queue or retry payments');
    // The price and button must not vanish: disappearing affordances strand the buyer.
    expect(markup).toContain('R4,200');
    expect(markup).toContain('Buy now');
  });

  it('online: enabled button, no reason paragraph, no disabled state anywhere', () => {
    const markup = renderToStaticMarkup(
      <StickyBuyBarSlot online priceLabel="R4,200" label="Buy now" onBuy={() => {}} />,
    );
    expect(markup).not.toContain('disabled');
    expect(markup).not.toContain('nt-buybar-offline-reason');
  });
});

describe('public/offline.html (the cached-page promise)', () => {
  const html = readFileSync(new URL('../../public/offline.html', import.meta.url), 'utf8');

  it('says you are offline, in the title and the body', () => {
    expect(html).toContain('You are offline');
    expect(html.match(/<title>.*offline.*<\/title>/i)?.[0]).toBeDefined();
  });

  it('refuses to imply queued payments, and carries no scripts to do it with', () => {
    expect(html).toContain('do not queue, stage or retry payments');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/<form/);
    expect(html).not.toContain('rel="stylesheet"');
  });
});
