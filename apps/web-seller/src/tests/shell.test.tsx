import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import './dom-setup.js';
import { Routes, type RouteDef } from '../router.js';
import { AppShell } from '../layout/shell.js';
import { createSellerSessionStore, type SellerSessionState } from '../lib/session.js';
import { createOnlineStore } from '../lib/online.js';
import type { SupportContact } from '../lib/support.js';
import { mount, textOf } from './mount.js';

const SRC = new URL('..', import.meta.url).pathname;
const SUPPORT: SupportContact = { kind: 'email', display: 'support@nastech.market' };

const anonymous: SellerSessionState = { status: 'anonymous' };
const authenticated: SellerSessionState = {
  status: 'authenticated',
  seller: { sellerId: 'sel_01', displayName: 'Thandi Mokoena', tier: 'T3' },
};

function routeAt(path: string): RouteDef {
  const route = Routes.find((candidate) => candidate.path === path);
  if (route === undefined) throw new Error(`Routes has no ${path}`);
  return route;
}

function fakeOnline(online: boolean) {
  return createOnlineStore({ initial: () => online, subscribe: () => () => {} });
}

function shellElement(
  route: RouteDef,
  session: SellerSessionState,
  activePath: string,
  online = true,
) {
  return (
    <AppShell
      route={route}
      activePath={activePath}
      routes={Routes}
      sessionStore={createSellerSessionStore(session)}
      navigate={() => {}}
      onSignOut={() => {}}
      support={SUPPORT}
      onlineStore={fakeOnline(online)}
    >
      <p data-page={route.path}>PAGE {route.path}</p>
    </AppShell>
  );
}

function renderShell(
  route: RouteDef,
  session: SellerSessionState,
  activePath = route.path,
  online = true,
): string {
  return renderToStaticMarkup(shellElement(route, session, activePath, online));
}

function mainCount(html: string): number {
  return html.match(/<main\b/g)?.length ?? 0;
}

function focusableBeforeSkipLink(html: string): boolean {
  // Start at the opening tag, not the class attribute: slicing at `class=` would leave the
  // skip link's own `<a` in `before` and report a false positive.
  const skipIndex = html.indexOf('<a class="nt-skip-link"');
  if (skipIndex < 0) return true;
  const before = html.slice(0, skipIndex);
  return /<(a|button|input|select|textarea|summary)\b/.test(before);
}

describe('one shell, one main, skip link first — every route', () => {
  it('authenticated render of all routes keeps the invariant', () => {
    for (const route of Routes) {
      const html = renderShell(route, authenticated);
      expect(mainCount(html), `${route.path} has ${mainCount(html)} main landmarks`).toBe(1);
      expect(html.indexOf('class="nt-skip-link"')).toBeGreaterThanOrEqual(0);
      expect(html.indexOf('class="nt-skip-link"')).toBeLessThan(html.indexOf('<header'));
      expect(focusableBeforeSkipLink(html), `${route.path} has focusable chrome before skip`).toBe(
        false,
      );
      const mainId = /<main id="([^"]+)"/.exec(html)?.[1];
      expect(mainId).toBeDefined();
      expect(html).toContain(`href="#${mainId!}"`);
      expect(html).not.toContain('<h1');
    }
  });

  it('anonymous renders keep the same frame and hide only guarded pages', () => {
    for (const route of Routes) {
      const html = renderShell(route, anonymous);
      expect(mainCount(html), `${route.path} has ${mainCount(html)} main landmarks`).toBe(1);
      expect(focusableBeforeSkipLink(html)).toBe(false);

      const guarded = route.class === 'critical' && route.path !== '/sign-in';
      if (guarded) {
        expect(html).not.toContain(`PAGE ${route.path}`);
        expect(html).toContain('Taking you to sign in');
      } else {
        expect(html).toContain(`PAGE ${route.path}`);
      }
    }
  });

  it('no route or feature page adds a second main landmark', () => {
    const dirs = [join(SRC, 'routes'), join(SRC, 'features')].filter((dir) => existsSync(dir));
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of sourceFiles(dir)) {
        const code = readFileSync(file, 'utf8');
        if (/<main\b/.test(code) || /role=["']main["']/.test(code)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the shell renders brand, account control, nav, offline slot and footer exactly once', () => {
    const html = renderShell(routeAt('/'), authenticated);
    expect(html).toContain('NasTech Market');
    expect(html.match(/aria-label="Account menu for Thandi Mokoena"/g)?.length).toBe(1);
    expect(html.match(/<nav /g)?.length).toBe(1);
    expect(html.match(/<footer\b/g)?.length).toBe(1);
    expect(html).toContain('support@nastech.market');
  });
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'tests' || entry.name.includes('.test.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('shell states', () => {
  it('offline is a written banner, not a spinner or a vanished screen', () => {
    const html = renderShell(routeAt('/'), authenticated, '/', false);
    expect(html).toContain('You are offline');
    expect(html).toContain('role="status"');
    expect(html).toContain('do not change bank or payout details');
    expect(html).toContain('PAGE /');
  });

  it('online renders no offline banner', () => {
    const html = renderShell(routeAt('/'), authenticated, '/', true);
    expect(html).not.toContain('You are offline');
  });

  it('checks session without showing the account as signed out', () => {
    const html = renderShell(routeAt('/'), { status: 'checking' });
    expect(html).toContain('Checking session');
    expect(html).not.toContain('>Sign in<');
  });

  it('route motion is off on critical screens and idle on first paint of an app route', () => {
    const dashboard = renderShell(routeAt('/'), authenticated);
    expect(dashboard).toContain('data-motion="idle"');
    expect(dashboard).toContain('data-route-class="app"');

    const payouts = renderShell(routeAt('/payouts'), authenticated);
    expect(payouts).toContain('data-motion="none"');
    expect(payouts).toContain('data-route-class="critical"');

    const settings = renderShell(routeAt('/settings'), authenticated);
    expect(settings).toContain('data-motion="none"');
  });
});

describe('shell navigation state and focus', () => {
  it('a detail route keeps exactly one nav row lit', () => {
    const html = renderShell(routeAt('/orders/:id'), authenticated, '/orders/ord_01');
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    expect(html).toMatch(/href="\/orders"[^>]*aria-current="page"/);
  });

  it('sign-in lights no seller section', () => {
    const html = renderShell(routeAt('/sign-in'), anonymous, '/sign-in');
    expect(html).not.toContain('aria-current="page"');
  });

  it('moves focus to main when the route changes, but not on first mount', async () => {
    const store = createSellerSessionStore(authenticated);
    const online = fakeOnline(true);
    const element = (route: RouteDef, path: string) => (
      <AppShell
        route={route}
        activePath={path}
        routes={Routes}
        sessionStore={store}
        navigate={() => {}}
        onSignOut={() => {}}
        support={SUPPORT}
        onlineStore={online}
      >
        <p>PAGE {route.path}</p>
      </AppShell>
    );

    const mounted = mount(element(routeAt('/'), '/'));
    await mounted.flush();
    expect(document.activeElement?.id).not.toBe('nt-main');

    await mounted.rerender(element(routeAt('/listings'), '/listings'));
    await mounted.flush();
    expect(document.activeElement?.id).toBe('nt-main');
    expect(textOf(mounted.container)).toContain('PAGE /listings');
    mounted.unmount();
  });
});
