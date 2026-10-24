import { describe, expect, it } from 'bun:test';
import { STAFF_ROLES, isStaffRole, roleLabel } from './role.js';
import { fixtureSession } from './api/fixtures.js';
import {
  CAPABILITIES,
  IMPERSONATION_FORBIDDEN_CAPABILITIES,
  capabilityForPath,
  decidePath,
  isCapability,
  isImpersonationBlockedPath,
  normaliseGrants,
  roleBaseline,
  roleToAsk,
} from './permissions.js';
import { mutationControl } from './audited-action.js';

describe('role', () => {
  it('recognises every declared role and rejects invented ones', () => {
    for (const role of STAFF_ROLES) expect(isStaffRole(role)).toBe(true);
    expect(isStaffRole('superuser')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(roleLabel('finance_checker')).toBe('Finance checker');
  });
});

describe('capabilities', () => {
  it('contains the seven core capabilities named by the brief', () => {
    for (const capability of ['listing.review', 'listing.takedown', 'dispute.decide', 'payout.retry', 'account.sanction', 'data.export', 'impersonate']) {
      expect(CAPABILITIES).toContain(capability as never);
      expect(isCapability(capability)).toBe(true);
    }
    expect(isCapability('admin')).toBe(false);
  });

  it('filters unknown grants instead of trusting the server payload', () => {
    const grants = normaliseGrants(['listing.review', 'root', 'listing.review', 'audit.view']);
    expect(grants.map((grant) => grant.capability)).toEqual(['listing.review', 'audit.view']);
  });

  it('does not derive capabilities from a route path', () => {
    expect(roleBaseline('reviewer')).not.toContain('audit.view');
    expect(capabilityForPath('/audit')).toBe('audit.view');
    expect(roleBaseline('reviewer')).not.toContain('audit.view');
  });

  it('has a role to ask for every capability', () => {
    for (const capability of CAPABILITIES) expect(roleToAsk(capability).length).toBeGreaterThan(2);
  });

  it('refuses a path without the granted capability, without naming any record', () => {
    const session = fixtureSession({ capabilities: ['queue.view'] });
    const decision = decidePath(session, '/audit');
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('no_capability');
    expect(decision.reason).toBe('Your role does not include this.');
    expect(decision.reason).not.toContain('record');
  });
});

describe('impersonation path refusal — three separate assertions', () => {
  const impersonating = fixtureSession({
    role: 'admin',
    impersonation: {
      operatorId: 'staff_thandi',
      targetId: 'user_42',
      targetLabel: 'Sipho Ndlovu',
      reason: 'Buyer cannot see order status',
      startedAt: '2026-10-22T09:00:00.000Z',
      expiresAt: '2026-10-22T09:30:00.000Z',
      stamp: {
        actor: 'staff_thandi',
        role: 'admin',
        target: 'user_42',
        reason: 'Buyer cannot see order status',
        at: '2026-10-22T09:00:00.000Z',
      },
    },
  });

  it('refuses /payouts while impersonating even with payout.view granted', () => {
    expect(impersonating.capabilities).toContain('payout.view');
    const decision = decidePath(impersonating, '/payouts');
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('impersonation_blocked');
  });

  it('refuses /reconciliation while impersonating even with finance.view granted', () => {
    expect(impersonating.capabilities).toContain('finance.view');
    expect(decidePath(impersonating, '/reconciliation').allowed).toBe(false);
    expect(decidePath(impersonating, '/reconciliation').code).toBe('impersonation_blocked');
  });

  it('refuses /audit while impersonating even with audit.view granted', () => {
    expect(impersonating.capabilities).toContain('audit.view');
    expect(decidePath(impersonating, '/audit').allowed).toBe(false);
    expect(decidePath(impersonating, '/audit').code).toBe('impersonation_blocked');
  });

  it('still allows the review queue, so support can do the job', () => {
    expect(decidePath(impersonating, '/').allowed).toBe(true);
  });
});

describe('mutation control', () => {
  const now = '2026-10-22T09:05:00.000Z';

  it('hides an action the session cannot perform', () => {
    const session = fixtureSession({ capabilities: ['queue.view'] });
    const control = mutationControl(session, 'listing.takedown', now, { reason: 'Prohibited item' });
    expect(control.visible).toBe(false);
    expect(control.disabled).toBe(true);
    expect(control.reason).toBe('Your role does not include this.');
  });

  it('renders the same action disabled with a visible reason when forced visible', () => {
    const session = fixtureSession({ capabilities: ['queue.view'] });
    const control = mutationControl(session, 'listing.takedown', now, { reason: 'Prohibited item', forceVisible: true });
    expect(control.visible).toBe(true);
    expect(control.disabled).toBe(true);
    expect(control.reason).toBe('Your role does not include this.');
  });

  it('refuses payout retry and sanction during impersonation', () => {
    for (const capability of IMPERSONATION_FORBIDDEN_CAPABILITIES) {
      const session = fixtureSession({
        role: 'admin',
        impersonation: {
          operatorId: 'staff_thandi',
          targetId: 'user_42',
          targetLabel: 'Sipho Ndlovu',
          reason: 'Support call about a payout',
          startedAt: '2026-10-22T09:00:00.000Z',
          expiresAt: '2026-10-22T09:30:00.000Z',
          stamp: { actor: 'staff_thandi', role: 'admin', target: 'user_42', reason: 'Support call about a payout', at: '2026-10-22T09:00:00.000Z' },
        },
      });
      const control = mutationControl(session, capability, now, { forceVisible: true, reason: 'Support decided to retry' });
      expect(control.disabled).toBe(true);
      expect(control.reason).toContain('Support sessions cannot perform');
    }
  });
});

describe('impersonation blocked paths', () => {
  it('blocks exactly the three money and audit surfaces and their children', () => {
    for (const path of ['/payouts', '/reconciliation', '/audit', '/payouts/batch_1', '/audit?actor=x']) {
      expect(isImpersonationBlockedPath(path)).toBe(true);
    }
    expect(isImpersonationBlockedPath('/risk')).toBe(false);
    expect(isImpersonationBlockedPath('/audit-notes')).toBe(false);
  });

  it('does not render a record identifier anywhere in a permission refusal', () => {
    const decision = decidePath(fixtureSession({ capabilities: [] }), '/disputes/dsp_secret_42');
    expect(decision.reason).not.toContain('dsp_secret_42');
    expect(decision.reason).not.toContain('not found');
  });
});
