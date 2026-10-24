import { beforeEach, describe, expect, it } from 'bun:test';
import type { ReactNode } from 'react';
import './dom-setup.js';
import { Routes, type RouteDef } from '../router.js';
import { guardRoute } from '../nav/guard.js';
import { RouteGate } from '../layout/route-gate.js';
import {
  clearPendingAction,
  readPendingAction,
} from '../lib/pending-action.js';
import type { SellerSessionState } from '../lib/session.js';
import { mount, textOf } from './mount.js';

function routeAt(path: string): RouteDef {
  const route = Routes.find((candidate) => candidate.path === path);
  if (route === undefined) throw new Error(`Routes has no ${path}`);
  return route;
}

const anonymous: SellerSessionState = { status: 'anonymous' };
const checking: SellerSessionState = { status: 'checking' };
const authenticated: SellerSessionState = {
  status: 'authenticated',
  seller: { sellerId: 'sel_01', displayName: 'Thandi Mokoena', tier: 'T2' },
};

beforeEach(() => {
  clearPendingAction();
});

describe('guardRoute by class', () => {
  it('redirects every anonymous critical route to sign-in and preserves the destination', () => {
    const critical = Routes.filter((route) => route.class === 'critical');
    expect(critical.length).toBeGreaterThanOrEqual(3);

    for (const route of critical) {
      if (route.path === '/sign-in') continue;
      const decision = guardRoute(route, anonymous, route.path);
      expect(decision.kind, `${route.path} was not guarded`).toBe('redirect');
      if (decision.kind !== 'redirect') continue;
      expect(decision.returnTo).toBe(route.path);
      expect(decision.to).toBe(`/sign-in?returnTo=${encodeURIComponent(route.path)}`);
    }
  });

  it('a query and hash on the blocked screen are preserved in returnTo', () => {
    const decision = guardRoute(routeAt('/payouts'), anonymous, '/payouts?tab=history#bank');
    expect(decision.kind).toBe('redirect');
    if (decision.kind !== 'redirect') return;
    expect(decision.returnTo).toBe('/payouts?tab=history#bank');
    expect(decision.to).toBe('/sign-in?returnTo=%2Fpayouts%3Ftab%3Dhistory%23bank');
  });

  it('never sends returnTo off-origin or back to sign-in', () => {
    const offOrigin = guardRoute(routeAt('/settings'), anonymous, '//evil.example/settings');
    expect(offOrigin.kind).toBe('redirect');
    if (offOrigin.kind === 'redirect') {
      expect(offOrigin.returnTo).toBe('/');
      expect(offOrigin.to).toBe('/sign-in?returnTo=%2F');
    }

    const loop = guardRoute(routeAt('/payouts'), anonymous, '/sign-in?returnTo=%2Fpayouts');
    expect(loop.kind).toBe('redirect');
    if (loop.kind === 'redirect') expect(loop.to).toBe('/sign-in');
  });

  it('sign-in is the one critical route that is not gated — otherwise it redirects to itself', () => {
    const decision = guardRoute(routeAt('/sign-in'), anonymous, '/sign-in');
    expect(decision).toEqual({ kind: 'allow', reason: 'sign-in-entry' });
  });

  it('a confirmed session opens critical routes', () => {
    for (const path of ['/payouts', '/settings']) {
      expect(guardRoute(routeAt(path), authenticated, path)).toEqual({
        kind: 'allow',
        reason: 'session-present',
      });
    }
  });

  it('a checking session holds the screen instead of guessing or redirecting', () => {
    const decision = guardRoute(routeAt('/payouts'), checking, '/payouts');
    expect(decision).toEqual({ kind: 'hold', reason: 'checking-session' });
  });

  it('app and scene routes are not sign-in problems', () => {
    expect(guardRoute(routeAt('/listings'), anonymous, '/listings').kind).toBe('allow');
    expect(guardRoute(routeAt('/listings/:id/capture'), anonymous, '/listings/l1/capture').kind).toBe(
      'allow',
    );
  });
});

function gate(
  route: RouteDef,
  session: SellerSessionState,
  activePath: string,
  navigate: (path: string) => void,
  children: ReactNode,
) {
  return (
    <RouteGate route={route} session={session} activePath={activePath} navigate={navigate}>
      {children}
    </RouteGate>
  );
}

describe('RouteGate renders the guard decision', () => {
  it('anonymous on a critical route: redirects with returnTo, saves the destination, hides the page', async () => {
    const calls: string[] = [];
    const mounted = mount(
      gate(routeAt('/payouts'), anonymous, '/payouts?tab=history', (path) => calls.push(path), (
        <p>PAYOUT BALANCE R12,400</p>
      )),
    );
    await mounted.flush();

    expect(calls).toEqual(['/sign-in?returnTo=%2Fpayouts%3Ftab%3Dhistory']);
    expect(textOf(mounted.container)).not.toContain('PAYOUT BALANCE');
    expect(textOf(mounted.container)).toContain('Taking you to sign in');
    expect(
      mounted.container.querySelector('a[href="/sign-in?returnTo=%2Fpayouts%3Ftab%3Dhistory"]'),
    ).not.toBeNull();

    const pending = readPendingAction();
    expect(pending?.path).toBe('/payouts?tab=history');
    expect(pending?.reason).toBe('session-required');
    mounted.unmount();
  });

  it('authenticated: renders the page and never navigates', async () => {
    const calls: string[] = [];
    const mounted = mount(
      gate(routeAt('/payouts'), authenticated, '/payouts', (path) => calls.push(path), (
        <p>PAYOUT BALANCE R12,400</p>
      )),
    );
    await mounted.flush();
    expect(textOf(mounted.container)).toContain('PAYOUT BALANCE R12,400');
    expect(calls).toEqual([]);
    mounted.unmount();
  });

  it('checking: holds the screen, shows neither the page nor a sign-in form', async () => {
    const calls: string[] = [];
    const mounted = mount(
      gate(routeAt('/settings'), checking, '/settings', (path) => calls.push(path), (
        <p>BANK DETAILS</p>
      )),
    );
    await mounted.flush();
    const text = textOf(mounted.container);
    expect(text).toContain('Checking your seller session');
    expect(text).not.toContain('BANK DETAILS');
    expect(calls).toEqual([]);
    mounted.unmount();
  });

  it('anonymous on sign-in still renders the sign-in page', async () => {
    const calls: string[] = [];
    const mounted = mount(
      gate(routeAt('/sign-in'), anonymous, '/sign-in', (path) => calls.push(path), (
        <p>SIGN IN FORM</p>
      )),
    );
    await mounted.flush();
    expect(textOf(mounted.container)).toContain('SIGN IN FORM');
    expect(calls).toEqual([]);
    mounted.unmount();
  });
});
