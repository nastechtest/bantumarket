import '../tests/dom-setup.js';
import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TIER_LABELS } from '@nastech/api-contracts';
import { HAS_3D_MARKER_TEXT } from '@nastech/design-system';
import { ItemPageView } from '../item-page.js';
import { createFixtureItemTransport, fixtureDetail } from '../api/fixtures.js';
import { checkoutHrefFor, inspectHrefFor } from '../buy/buy-bar.js';
import { itemSeoFields } from '../seo.js';
import { resolveListingId } from '../index.js';
import { frameAfterStep, frameFromDelta, stripFrameStyle, DEFAULT_SWEEP_PX } from '../media/turntable.js';
import { TURNTABLE_FRAME_COUNT } from '../api/item-transport.js';
import { zoomOriginFromTap } from '../media/zoom-on-tap.js';
import { readSaved, toggleSaved, SAVED_LISTINGS_KEY } from '../buy/save-listing.js';
import type { Store } from '../buy/save-listing.js';
import { shareListing, buildShareUrl, shareCaption } from '../buy/share.js';
import type { ItemDetail } from '../api/item-transport.js';

const transport = createFixtureItemTransport();
const detail = fixtureDetail('lst_01')!;

function fakeStore(initial: Record<string, string> = {}): Store & { dump: () => Record<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    dump: () => Object.fromEntries(map),
  };
}

describe('item page composition', () => {
  const html = renderToStaticMarkup(<ItemPageView detail={detail} transport={transport} canonicalBase="https://nastech.market" />);

  it('shows title, seller-stated description and the contract price format', () => {
    expect(html).toContain('Seiko “Presage” automatic, 40.5 mm');
    expect(html).toContain('R4,200');
    expect(html).toContain('Case serial matches the movement plate');
  });

  it('the tier is the contract label rendered through VerificationBadge, once per page', () => {
    expect(html).toContain(TIER_LABELS.T4);
    expect(html).toContain('data-tier="T4"');
  });

  it('buy path points at checkout with the listing id; 3D is a navigation link, not inline', () => {
    expect(html).toContain(`href="${checkoutHrefFor('lst_01')}"`);
    expect(html).toContain(`href="${inspectHrefFor('lst_01')}"`);
    expect(html).toContain('href="/item/lst_01/inspect"');
    expect(html).toContain(HAS_3D_MARKER_TEXT);
    // The marker text is never inside a badge element — capture ≠ check (spec §13.2).
    const badgeZone = html.match(/<span class="ds-badge"[^>]*>.*?<\/span>/g) ?? [];
    for (const badge of badgeZone) expect(badge).not.toContain(HAS_3D_MARKER_TEXT);
  });

  it('an out-of-stock listing swaps the buy button for an explicit statement', () => {
    const sold = { ...detail, inStock: false } satisfies ItemDetail;
    const soldHtml = renderToStaticMarkup(<ItemPageView detail={sold} transport={transport} />);
    expect(soldHtml).not.toContain('data-testid="buy-now"');
    expect(soldHtml).toContain('data-testid="sold-out"');
    expect(soldHtml).toContain('no longer available');
  });

  it('listing without 3D gets no inspect link at all — the link is a fact, not a menu item', () => {
    const plain = fixtureDetail('lst_02')!;
    const plainHtml = renderToStaticMarkup(<ItemPageView detail={plain} transport={transport} />);
    expect(plainHtml).not.toContain('href="/item/lst_02/inspect"');
  });

  it('seo fields describe the same facts the page shows', () => {
    const fields = itemSeoFields(detail);
    expect(fields.title).toContain('Seiko');
    expect(fields.title).toContain('R4,200');
    expect(fields.canonicalPath).toBe('/item/lst_01');
    expect(fields.description).toContain('hairline');
    expect(fields.description.length).toBeLessThanOrEqual(240);
  });
});

describe('resolveListingId (route pattern → id)', () => {
  it('reads the :id segment from the live path', () => {
    expect(resolveListingId('/item/:id', '/item/lst_01')).toBe('lst_01');
    expect(resolveListingId('/item/:id', '/item/lst%2001')).toBe('lst 01');
  });
  it('returns empty (validation error, no fetch) on shape mismatch or malformed escapes', () => {
    expect(resolveListingId('/item/:id', '/item/lst_01/inspect')).toBe('');
    expect(resolveListingId('/item/:id', '/search')).toBe('');
    expect(resolveListingId('/item/:id', '/item/%zz')).toBe('');
    expect(resolveListingId('/search', '/search')).toBe('');
  });
});

describe('turntable maths (frames, not polygons)', () => {
  it('drag deltas wrap in both directions over the 12 frames', () => {
    expect(frameFromDelta(DEFAULT_SWEEP_PX, DEFAULT_SWEEP_PX)).toBe(0);
    expect(frameFromDelta(DEFAULT_SWEEP_PX / 2, DEFAULT_SWEEP_PX)).toBe(6);
    expect(frameFromDelta(-DEFAULT_SWEEP_PX / 12, DEFAULT_SWEEP_PX)).toBe(11);
    expect(frameFromDelta(DEFAULT_SWEEP_PX * 3 + DEFAULT_SWEEP_PX / 4, DEFAULT_SWEEP_PX)).toBe(3);
    expect(TURNTABLE_FRAME_COUNT).toBe(12);
  });

  it('keyboard steps wrap: left from frame 0 lands on frame 12, right from 12 lands on 1', () => {
    expect(frameAfterStep(0, -1)).toBe(11);
    expect(frameAfterStep(11, 1)).toBe(0);
  });

  it('the strip style addresses frames 0..11 as exact percentages of the 12-slice strip', () => {
    const s = stripFrameStyle(0, '/x.jpg');
    expect(s.backgroundSize).toBe('1200% 100%');
    expect(s.backgroundPosition).toBe('0% 0%');
    expect(stripFrameStyle(11, '/x.jpg').backgroundPosition).toBe('100% 0%');
    expect(String(stripFrameStyle(6, '/x.jpg').backgroundPosition)).toMatch(/^54\.545\d*% 0%$/);
    expect(stripFrameStyle(5, '/a.jpg').backgroundImage).toBe('url("/a.jpg")');
  });

  it('zoom origins clamp away from the edges so the inspected mark cannot slide off at 2.2×', () => {
    const rect = { left: 0, top: 0, width: 300, height: 300 };
    expect(zoomOriginFromTap(0, 0, rect)).toEqual({ originX: 10, originY: 10 });
    expect(zoomOriginFromTap(300, 300, rect)).toEqual({ originX: 90, originY: 90 });
    expect(zoomOriginFromTap(150, 75, rect)).toEqual({ originX: 50, originY: 25 });
    expect(zoomOriginFromTap(5, 5, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ originX: 50, originY: 50 });
  });
});

describe('save / share behaviours', () => {
  it('toggling persists a listing id list and untoggles it; a poisoned store reads as empty', () => {
    const store = fakeStore();
    expect(toggleSaved(store, 'lst_01').saved).toBe(true);
    expect(JSON.parse(store.dump()[SAVED_LISTINGS_KEY]!)).toEqual(['lst_01']);
    expect(toggleSaved(store, 'lst_01').saved).toBe(false);
    expect(readSaved(fakeStore({ [SAVED_LISTINGS_KEY]: 'not json{{' })).size).toBe(0);
  });

  it('a write that throws (private-mode Safari) keeps the toggle working and records the failure', () => {
    const store: Store = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const result = toggleSaved(store, 'lst_02');
    expect(result.saved).toBe(true);
    expect(result.storeFailed).toBe(true);
  });

  it('share prefers the OS sheet, falls back to clipboard, then to nothing-but-the-link', async () => {
    const shared: string[] = [];
    const viaSheet = await shareListing(detail, { navigator: { share: async (d) => void shared.push(d.url ?? '') } }, 'https://nastech.market');
    expect(viaSheet).toEqual({ kind: 'shared' });
    expect(shared).toEqual(['https://nastech.market/item/lst_01']);

    const copied: string[] = [];
    const viaClipboard = await shareListing(detail, { clipboard: { writeText: async (t) => void copied.push(t) } }, 'https://nastech.market');
    expect(viaClipboard).toEqual({ kind: 'copied' });
    expect(copied).toEqual([buildShareUrl('lst_01', 'https://nastech.market')]);

    const nothing = await shareListing(detail, {}, 'https://nastech.market');
    expect(nothing).toEqual({ kind: 'unsupported' });
  });

  it('share caption carries no price — a stale screenshot must not quote yesterday’s number', () => {
    expect(shareCaption(detail, 'https://x/item/lst_01')).not.toContain('4,200');
    expect(shareCaption(detail, 'https://x/item/lst_01')).toContain('https://x/item/lst_01');
  });
});

describe('the wired route (index default export) in a browser-shaped DOM', () => {
  it('fetches the fixture detail, renders the full page, and writes the document head', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { default: ItemFeaturePage } = await import('../index.js');
    const route = { path: '/item/:id', class: 'first-paint', label: 'Item' } as const;
    await act(async () => {
      window.history.pushState({}, '', '/item/lst_01');
      createRoot(container).render(<ItemFeaturePage route={route} />);
    });
    // Fixture transport resolves synchronously; one act flush later the page is complete.
    const text = container.textContent ?? '';
    expect(text).toContain('Seiko “Presage” automatic, 40.5 mm');
    expect(text).toContain('Condition, in words');
    expect(document.title).toContain('Seiko');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('hairline');
    container.innerHTML = '';
  });

  it('a garbage id renders the validation error instead of fetching the void', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { default: ItemFeaturePage } = await import('../index.js');
    await act(async () => {
      window.history.pushState({}, '', '/item/');
      createRoot(container).render(<ItemFeaturePage route={{ path: '/item/:id', class: 'first-paint', label: 'Item' }} />);
    });
    expect(container.textContent).toContain('not valid');
    container.innerHTML = '';
  });
});
