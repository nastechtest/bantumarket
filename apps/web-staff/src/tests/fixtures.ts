import { Routes, resolve } from '../router.js';
import type { RouteDef } from '../router.js';
import type { Capability } from '../shell/permissions.js';
import { CAPABILITIES } from '../shell/permissions.js';
import { FIXTURE_NOW, fixtureSession } from '../shell/api/fixtures.js';
import type { StaffSession } from '../shell/session.js';

export const NOW = FIXTURE_NOW;

export function tableRoute(path: string): RouteDef {
  const route = Routes.find((candidate) => candidate.path === path);
  if (route === undefined) throw new Error(`route table has no entry for ${path}`);
  return route;
}

export function routeAt(pathname: string): RouteDef {
  const route = resolve(pathname);
  if (route.path === '*' && pathname !== '*') throw new Error(`route table has no match for ${pathname}`);
  return route;
}

export function allCapabilitiesSession(): StaffSession {
  return fixtureSession({
    operatorId: 'staff_naledi',
    displayName: 'Naledi Khumalo',
    role: 'admin',
    capabilities: CAPABILITIES,
    expiresAt: '2026-10-22T12:00:00.000Z',
  });
}

export function sessionMissing(capability: Capability): StaffSession {
  return fixtureSession({
    operatorId: 'staff_naledi',
    displayName: 'Naledi Khumalo',
    role: 'admin',
    capabilities: CAPABILITIES.filter((candidate) => candidate !== capability),
    expiresAt: '2026-10-22T12:00:00.000Z',
  });
}

export function reviewerSession(): StaffSession {
  return fixtureSession({
    role: 'reviewer',
    capabilities: ['queue.view', 'listing.review'],
    expiresAt: '2026-10-22T12:00:00.000Z',
  });
}

export function impersonatingSession(capabilities: readonly Capability[] = CAPABILITIES): StaffSession {
  const base = fixtureSession({
    operatorId: 'staff_naledi',
    displayName: 'Naledi Khumalo',
    role: 'admin',
    capabilities,
    expiresAt: '2026-10-22T12:00:00.000Z',
  });
  const reason = 'Dispute evidence review';
  return {
    ...base,
    impersonation: {
      operatorId: base.operatorId,
      targetId: 'usr_4821',
      targetLabel: 'Sipho Dlamini (buyer)',
      reason,
      startedAt: '2026-10-22T08:30:00.000Z',
      expiresAt: '2026-10-22T10:30:00.000Z',
      stamp: {
        actor: base.operatorId,
        role: base.role,
        target: 'usr_4821',
        reason,
        at: '2026-10-22T08:30:00.000Z',
      },
    },
  };
}
