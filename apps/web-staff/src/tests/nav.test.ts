import './dom.js';
import { describe, expect, it } from 'bun:test';
import { Routes } from '../router.js';
import { CAPABILITIES } from '../shell/permissions.js';
import { fixtureSession } from '../shell/api/fixtures.js';
import { canSee } from '../nav/can-see.js';
import { buildNavModel, isCurrentNavPath } from '../nav/nav-model.js';
import { NAV_GROUPS, NAV_PATHS, requiredCapability } from '../nav/route-policy.js';
import {
  NOW,
  allCapabilitiesSession,
  impersonatingSession,
  reviewerSession,
  sessionMissing,
  tableRoute,
} from './fixtures.js';

function visiblePaths(session: Parameters<typeof buildNavModel>[0]): readonly string[] {
  return buildNavModel(session, NOW).flatMap((section) => section.items.map((item) => item.path));
}

describe('navigation is derived from the route table', () => {
  it('renders every group in order, with the table label and a real route for each path', () => {
    const sections = buildNavModel(allCapabilitiesSession(), NOW);
    expect(sections.map((section) => section.id)).toEqual(['work', 'programme', 'money', 'records']);
    expect(sections.flatMap((section) => section.items.map((item) => item.path))).toEqual(
      NAV_GROUPS.flatMap((group) => group.paths),
    );
    for (const section of sections) {
      for (const item of section.items) {
        expect(item.label).toBe(tableRoute(item.path).label);
      }
    }
  });

  it('never treats a detail, sign-in or wildcard route as a destination', () => {
    for (const group of NAV_GROUPS) {
      for (const path of group.paths) {
        expect(Routes.some((route) => route.path === path)).toBe(true);
      }
    }
    for (const nonDestination of ['/listings/:id', '/listings/:id/capture', '/disputes/:id', '/sign-in', '*']) {
      expect(NAV_PATHS.has(nonDestination)).toBe(false);
    }
    expect(canSee(tableRoute('/listings/:id'), allCapabilitiesSession(), NOW)).toBe(false);
    expect(canSee(tableRoute('*'), allCapabilitiesSession(), NOW)).toBe(false);
  });
});

describe('the rail is filtered by capability, not by role name', () => {
  it('shows a reviewer only the queue even though it is signed in', () => {
    expect(visiblePaths(reviewerSession())).toEqual(['/']);
  });

  it('shows an auditor only the surfaces audit.view and finance.view open', () => {
    const auditor = fixtureSession({
      role: 'auditor',
      capabilities: ['audit.view', 'audit.export', 'finance.view', 'dispute.view'],
      expiresAt: '2026-10-22T12:00:00.000Z',
    });
    expect(visiblePaths(auditor)).toEqual(['/disputes', '/reconciliation', '/audit']);
  });

  it('drops a group entirely when no destination in it survives', () => {
    const sections = buildNavModel(reviewerSession(), NOW);
    expect(sections.map((section) => section.id)).toEqual(['work']);
    expect(sections[0]?.title).toBe('Work');
  });

  it('hides every critical route when its own token is removed — one token per route', () => {
    const all = allCapabilitiesSession();
    for (const path of ['/reconciliation', '/payouts', '/audit']) {
      const token = requiredCapability(path);
      if (token === null) throw new Error(`critical route ${path} has no capability token`);
      expect(CAPABILITIES).toContain(token);
      expect(tableRoute(path).class).toBe('critical');
      expect(canSee(tableRoute(path), all, NOW)).toBe(true);
      expect(canSee(tableRoute(path), sessionMissing(token), NOW)).toBe(false);
      expect(visiblePaths(sessionMissing(token))).not.toContain(path);
    }
  });

  it('has no visible rail at all without a usable session', () => {
    const mfaIncomplete = fixtureSession({
      capabilities: CAPABILITIES,
      mfaSatisfied: false,
      expiresAt: '2026-10-22T12:00:00.000Z',
    });
    const expired = fixtureSession({
      capabilities: CAPABILITIES,
      expiresAt: '2026-10-22T09:00:00.000Z',
    });
    expect(visiblePaths(null)).toEqual([]);
    expect(visiblePaths(mfaIncomplete)).toEqual([]);
    expect(visiblePaths(expired)).toEqual([]);
  });
});

describe('impersonation and the rail', () => {
  it('hides payouts, reconciliation and audit from a fully privileged support session', () => {
    const session = impersonatingSession();
    const paths = visiblePaths(session);
    expect(paths).not.toContain('/payouts');
    expect(paths).not.toContain('/reconciliation');
    expect(paths).not.toContain('/audit');
    expect(paths).toContain('/');
  });
});

describe('current-page marking', () => {
  it('keeps list entries current on their detail routes and keeps / exact', () => {
    expect(isCurrentNavPath('/disputes', '/disputes/case_42')).toBe(true);
    expect(isCurrentNavPath('/disputes', '/disputes')).toBe(true);
    expect(isCurrentNavPath('/disputes', '/risk')).toBe(false);
    expect(isCurrentNavPath('/', '/')).toBe(true);
    expect(isCurrentNavPath('/', '/payouts')).toBe(false);
  });
});
