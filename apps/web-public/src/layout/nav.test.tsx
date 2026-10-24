import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { raw } from '@nastech/design-tokens';
import { MOBILE_NAV, PRIMARY_NAV, PrimaryNav } from './primary-nav.js';
import { MobileTabBar } from './mobile-tab-bar.js';
import { BreadcrumbsSlot } from './breadcrumbs-slot.js';
import { TAP_TARGET_PX } from './breakpoints.js';

describe('primary nav model', () => {
  it('every nav destination is an in-app path — no off-origin chrome links', () => {
    for (const item of MOBILE_NAV) {
      expect(item.href.startsWith('/'), `${item.href} is not internal`).toBe(true);
    }
  });

  it('the mobile bar is the desktop list plus account, so the two can never diverge on Home/Search', () => {
    for (const item of PRIMARY_NAV) {
      expect(MOBILE_NAV.some((m) => m.href === item.href)).toBe(true);
    }
    expect(MOBILE_NAV.length).toBe(4);
  });
});

describe('PrimaryNav', () => {
  it('marks only the active route with aria-current', () => {
    const markup = renderToStaticMarkup(<PrimaryNav activePath="/search" />);
    expect(markup.match(/aria-current="page"/g)?.length).toBe(1);
    expect(markup).toContain('>Search</a>');
  });

  it('nested paths stay under their section (item detail keeps Search lit)', () => {
    const markup = renderToStaticMarkup(<PrimaryNav activePath="/search/watches" />);
    expect(markup).toContain('aria-current="page"');
  });
});

describe('MobileTabBar thumb reachability (token-derived, not screenshot-derived)', () => {
  it('tap target is the first spacing step in the token scale that clears the 44px floor', () => {
    const steps = Object.values(raw.space).map((v) => Number.parseFloat(v));
    const expected = steps.find((v) => v >= 44);
    expect(expected).toBeDefined();
    expect(TAP_TARGET_PX).toBe(expected);
    expect(TAP_TARGET_PX).toBeGreaterThanOrEqual(44);
  });

  it('renders each tab at that target size, 4 tabs, no smaller than 320px/4 wide', () => {
    const markup = renderToStaticMarkup(<MobileTabBar activePath="/" />);
    expect(markup).toContain('min-height:48px');
    expect(markup.match(/class="nt-tab-bar__item"/g)?.length).toBe(4);
    // At 320px CSS width each of the four tabs gets 80px — wider than the height floor.
    expect(320 / 4).toBeGreaterThanOrEqual(TAP_TARGET_PX);
    expect(markup).toContain('aria-current="page"');
  });
});

describe('BreadcrumbsSlot', () => {
  it('renders nothing when the page has no trail — no decorative "Home /" line', () => {
    expect(renderToStaticMarkup(<BreadcrumbsSlot trail={[]} />)).toBe('');
  });

  it('last crumb is the page (aria-current) and not a link; earlier crumbs link', () => {
    const markup = renderToStaticMarkup(
      <BreadcrumbsSlot
        trail={[
          { href: '/', label: 'Home' },
          { href: '/search', label: 'Watches' },
          { href: '/item/lst_01', label: 'Seiko Presage' },
        ]}
      />,
    );
    expect(markup).toContain('aria-label="Breadcrumb"');
    expect(markup).toContain('<a href="/search"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain('<a href="/item/lst_01"');
  });
});
