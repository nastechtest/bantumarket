import '../../shell/test-dom.js';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { beginImpersonation, endImpersonation, planImpersonation, ImpersonationBanner } from './impersonate.js';
import { createAuthFixture } from './api/fixtures.js';
import { fixtureSession } from '../../shell/api/fixtures.js';
import { roleBaseline } from '../../shell/permissions.js';
import { sessionRefusal } from '../../shell/session.js';
import type { StaffSession } from '../../shell/session.js';
import type { ImpersonationStart } from './api/staff-auth-transport.js';

const now = '2026-10-22T09:00:00.000Z';
const admin = fixtureSession({ role: 'admin', capabilities: [...roleBaseline('admin')] });
const draft = {
  targetId: 'user_42',
  targetLabel: 'Sipho Ndlovu',
  reason: 'Buyer cannot see the order status',
  durationMinutes: 15,
};

describe('planImpersonation', () => {
  it('refuses without the impersonate capability', () => {
    const session = fixtureSession({ capabilities: ['queue.view'] });
    const plan = planImpersonation(session, draft, now);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toContain('does not include');
  });

  it('refuses impersonating your own account', () => {
    const plan = planImpersonation(admin, { ...draft, targetId: admin.operatorId }, now);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toContain('your own account');
  });

  it('refuses a reason that an auditor could not use', () => {
    const plan = planImpersonation(admin, { ...draft, reason: 'help' }, now);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toContain('at least 12 characters');
  });

  it('refuses a session longer than the hard maximum', () => {
    const plan = planImpersonation(admin, { ...draft, durationMinutes: 61 }, now);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toContain('between 1 and 60');
  });

  it('builds the stamp before the session exists, with actor, target, reason and time', () => {
    const plan = planImpersonation(admin, draft, now);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.stamp.actor).toBe(admin.operatorId);
      expect(plan.stamp.role).toBe('admin');
      expect(plan.stamp.target).toBe('user_42');
      expect(plan.stamp.reason).toBe(draft.reason);
      expect(plan.stamp.at).toBe(now);
      expect(plan.expiresAt).toBe('2026-10-22T09:15:00.000Z');
    }
  });

  it('refuses a second concurrent support session', () => {
    const plan = planImpersonation(admin, draft, now);
    if (!plan.ok) throw new Error('fixture plan should be valid');
    const active: StaffSession = {
      ...admin,
      impersonation: {
        operatorId: admin.operatorId,
        targetId: 'user_1',
        targetLabel: 'Other',
        reason: 'Existing support call',
        startedAt: now,
        expiresAt: '2026-10-22T09:10:00.000Z',
        stamp: plan.stamp,
      },
    };
    const second = planImpersonation(active, draft, now);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toContain('already open');
  });
});

describe('beginImpersonation', () => {
  it('hands the completed stamp to the transport before returning a session', async () => {
    const fixture = createAuthFixture({ operator: admin });
    let received: ImpersonationStart | null = null;
    const wrapped = {
      ...fixture,
      async startImpersonation(request: ImpersonationStart) {
        received = request;
        return fixture.startImpersonation!(request);
      },
    };
    const result = await beginImpersonation(wrapped, admin, draft, now);
    expect(received).not.toBeNull();
    expect(received!.stamp.actor).toBe('staff_thandi');
    expect(received!.stamp.target).toBe('user_42');
    expect(received!.stamp.at).toBe(now);
    expect(fixture.audit).toHaveLength(1);
    expect(result.session.impersonation?.targetId).toBe('user_42');
    expect(result.session.impersonation?.expiresAt).toBe('2026-10-22T09:15:00.000Z');
  });

  it('never reaches the transport when the plan is refused', async () => {
    let calls = 0;
    const transport = {
      async startImpersonation() {
        calls += 1;
        return admin;
      },
    };
    await expect(beginImpersonation(transport, admin, { ...draft, targetId: admin.operatorId }, now)).rejects.toThrow(
      'your own account',
    );
    expect(calls).toBe(0);
  });

  it('refuses a server response that does not actually begin the session', async () => {
    await expect(
      beginImpersonation({ startImpersonation: async () => admin }, admin, draft, now),
    ).rejects.toThrow('did not return a support session');
  });

  it('ends the session with its own stamp and no lingering impersonation', async () => {
    const fixture = createAuthFixture({ operator: admin });
    const started = await beginImpersonation(fixture, admin, draft, now);
    await endImpersonation(fixture, started.session, '2026-10-22T09:03:00.000Z');
    expect(fixture.audit).toHaveLength(2);
    expect(fixture.audit[1]).toMatchObject({
      actor: 'staff_thandi',
      target: 'user_42',
      reason: 'Ended support session',
      at: '2026-10-22T09:03:00.000Z',
    });
    expect(fixture.session()?.impersonation).toBeNull();
  });
});

describe('what a support session may not do', () => {
  it('refuses payout retry and account sanction, even for an admin', () => {
    const impersonating = {
      ...admin,
      impersonation: {
        operatorId: admin.operatorId,
        targetId: 'user_42',
        targetLabel: 'Sipho Ndlovu',
        reason: draft.reason,
        startedAt: now,
        expiresAt: '2026-10-22T09:15:00.000Z',
        stamp: { actor: admin.operatorId, role: 'admin' as const, target: 'user_42', reason: draft.reason, at: now },
      },
    };
    for (const capability of ['payout.retry', 'account.sanction'] as const) {
      expect(
        sessionRefusal(impersonating, capability, now, { impersonationForbidden: ['payout.retry', 'account.sanction'] })?.code,
      ).toBe('impersonation_forbidden');
    }
  });

  it('the banner names operator, target, end time and the refusal, and cannot be dismissed', () => {
    const plan = planImpersonation(admin, draft, now);
    if (!plan.ok) throw new Error('fixture plan should be valid');
    const session: StaffSession = {
      ...admin,
      impersonation: {
        operatorId: admin.operatorId,
        targetId: draft.targetId,
        targetLabel: draft.targetLabel,
        reason: draft.reason,
        startedAt: now,
        expiresAt: plan.expiresAt,
        stamp: plan.stamp,
      },
    };
    const markup = renderToStaticMarkup(<ImpersonationBanner session={session} now={now} onEnd={() => undefined} />);
    expect(markup).toContain('Support session');
    expect(markup).toContain('Thandi Mokoena');
    expect(markup).toContain('Sipho Ndlovu');
    expect(markup).toContain('22 Oct 2026, 09:15 UTC');
    expect(markup).toContain('Payout, reconciliation, audit, payout retry and sanctions are refused');
    expect(markup).toContain('End support session');
    expect(markup.toLowerCase()).not.toContain('dismiss');
  });
});
