import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import './dom-setup.js';
import { Routes, type RouteDef } from '../router.js';
import { activeNavPath, deriveNav, NAV_EXCLUSIONS } from '../nav/nav-items.js';
import { MobileNav } from '../layout/mobile-nav.js';
import { SideNav } from '../layout/side-nav.js';
import { mount, stubMatchMedia, textOf } from './mount.js';

function hrefsIn(markup: string): string[] {
  return [...markup.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]!);
}

function itemsFor(routes: readonly RouteDef[]) {
  return deriveNav(routes).items;
}

describe('nav derives from the route table', () => {
  it('accounts for every route exactly once — nav item or written exclusion', () => {
    const { items, excluded } = deriveNav(Routes);
    const accounted = [...items.map((item) => item.path), ...excluded.map((entry) => entry.path)];

    expect(accounted.length).toBe(Routes.length);
    expect(new Set(accounted).size).toBe(Routes.length);
    expect([...accounted].sort()).toEqual(Routes.map((route) => route.path).sort());
  });

  it('every nav item copies the route label and class; nothing is typed twice', () => {
    const { items } = deriveNav(Routes);
    expect(items.length).toBe(6);

    for (const item of items) {
      const route = Routes.find((candidate) => candidate.path === item.path);
      expect(route, `${item.path} is not in Routes`).toBeDefined();
      expect(item.label).toBe(route!.label);
      expect(item.routeClass).toBe(route!.class);
      expect(item.path.includes(':')).toBe(false);
    }
  });

  it('every exclusion names a real route and carries a reason', () => {
    for (const exclusion of NAV_EXCLUSIONS) {
      expect(
        Routes.some((route) => route.path === exclusion.path),
        `${exclusion.path} is a stale exclusion`,
      ).toBe(true);
      expect(exclusion.reason.trim().length).toBeGreaterThan(20);
    }

    const { excluded } = deriveNav(Routes);
    for (const entry of excluded) {
      expect(
        Routes.some((route) => route.path === entry.path),
        `excluded unknown route ${entry.path}`,
      ).toBe(true);
      expect(entry.reason.trim().length).toBeGreaterThan(20);
    }
  });

  it('a route added to Routes appears in nav without editing a nav list', () => {
    const reviews: RouteDef = { path: '/reviews', class: 'app', label: 'Reviews' };
    const extended = [...Routes, reviews];
    const items = itemsFor(extended);

    const added = items.find((item) => item.path === '/reviews');
    expect(added).toEqual({ path: '/reviews', label: 'Reviews', routeClass: 'app' });

    const markup = renderToStaticMarkup(<MobileNav items={items} activePath="/" />);
    expect(markup).toContain('href="/reviews"');
    expect(markup).toContain('<span>Reviews</span>');
  });

  it('fails if a hard-coded item is added: rendered links are exactly the derived items', () => {
    const items = itemsFor(Routes);
    const mobile = renderToStaticMarkup(<MobileNav items={items} activePath="/" />);
    expect(hrefsIn(mobile)).toEqual(items.map((item) => item.path));

    stubMatchMedia(true);
    const mounted = mount(<SideNav items={items} activePath="/" />);
    const sideHrefs = [...mounted.container.querySelectorAll('nav a')].map((anchor) =>
      anchor.getAttribute('href'),
    );
    expect(sideHrefs).toEqual(items.map((item) => item.path));
    expect(textOf(mounted.container)).not.toContain('Reviews');
    mounted.unmount();
  });
});

describe('active nav', () => {
  const items = itemsFor(Routes);

  it('lights one section, keeps detail routes under their list, and ignores non-nav routes', () => {
    expect(activeNavPath('/', items)).toBe('/');
    expect(activeNavPath('/listings', items)).toBe('/listings');
    expect(activeNavPath('/listings/lst_01', items)).toBe('/listings');
    expect(activeNavPath('/listings/lst_01/capture', items)).toBe('/listings');
    expect(activeNavPath('/orders/ord_01', items)).toBe('/orders');
    expect(activeNavPath('/messages/thr_01', items)).toBe('/messages');
    expect(activeNavPath('/payouts?tab=history', items)).toBe('/payouts');
    expect(activeNavPath('/payouts/', items)).toBe('/payouts');
    expect(activeNavPath('/settings', items)).toBe('/settings');
    expect(activeNavPath('/sign-in', items)).toBeNull();
    expect(activeNavPath('/nowhere', items)).toBeNull();
  });

  it('matches on a path segment boundary, not a string prefix', () => {
    expect(activeNavPath('/listings-archive', items)).toBeNull();
    expect(activeNavPath('/ord-ers', items)).toBeNull();
  });

  it('renders exactly one aria-current for a section, including a detail path', () => {
    const markup = renderToStaticMarkup(<MobileNav items={items} activePath="/listings" />);
    expect(markup.match(/aria-current="page"/g)?.length).toBe(1);
    expect(markup).toContain('href="/listings"');
  });
});

describe('one nav model, two placements', () => {
  it('compact nav renders below md and the desktop nav renders above it', () => {
    stubMatchMedia(false);
    const compact = mount(<MobileNav items={itemsFor(Routes)} activePath="/" />);
    expect(compact.container.querySelectorAll('nav a').length).toBe(6);
    compact.unmount();

    stubMatchMedia(true);
    const desktopMobile = mount(<MobileNav items={itemsFor(Routes)} activePath="/" />);
    expect(desktopMobile.container.querySelector('nav')).toBeNull();
    desktopMobile.unmount();

    const desktop = mount(<SideNav items={itemsFor(Routes)} activePath="/" />);
    expect(desktop.container.querySelectorAll('nav a').length).toBe(6);
    expect(desktop.container.querySelector('nav')?.getAttribute('aria-label')).toBe('Seller sections');
    desktop.unmount();
  });
});
