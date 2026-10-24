import { describe, expect, it } from 'bun:test';
import { fixtureSession } from './api/fixtures.js';
import {
  impersonationExpired,
  isImpersonating,
  isSessionExpired,
  remainingSessionMs,
  sessionHasCapability,
  sessionRefusal,
} from './session.js';

const now = '2026-10-22T09:00:00.000Z';

describe('session capability checks', () => {
  it('answers from the issued list, not from a role name', () => {
    const session = fixtureSession({ role: 'admin', capabilities: ['queue.view'] });
    expect(sessionHasCapability(session, 'queue.view')).toBe(true);
    expect(sessionHasCapability(session, 'audit.view')).toBe(false);
  });

  it('refuses a signed-out session with sign-in copy', () => {
    expect(sessionRefusal(null, 'queue.view', now)?.code).toBe('not_signed_in');
  });

  it('refuses a session without MFA', () => {
    const session = fixtureSession({ mfaSatisfied: false });
    expect(sessionRefusal(session, 'queue.view', now)?.code).toBe('mfa_required');
  });

  it('refuses an expired session before capability is considered', () => {
    const session = fixtureSession({ capabilities: [], expiresAt: '2026-10-22T08:59:59.000Z' });
    expect(sessionRefusal(session, 'queue.view', now)?.code).toBe('session_expired');
  });

  it('reports remaining time clamped at zero', () => {
    const session = fixtureSession({ expiresAt: '2026-10-22T09:10:00.000Z' });
    expect(remainingSessionMs(session, now)).toBe(600_000);
    expect(remainingSessionMs(session, '2026-10-22T10:00:00.000Z')).toBe(0);
    expect(isSessionExpired(session, '2026-10-22T10:00:00.000Z')).toBe(true);
  });
});

describe('impersonation expiry', () => {
  const impersonating = fixtureSession({
    role: 'admin',
    impersonation: {
      operatorId: 'staff_thandi',
      targetId: 'user_42',
      targetLabel: 'Sipho Ndlovu',
      reason: 'Support call',
      startedAt: '2026-10-22T08:55:00.000Z',
      expiresAt: '2026-10-22T09:10:00.000Z',
      stamp: { actor: 'staff_thandi', role: 'admin', target: 'user_42', reason: 'Support call', at: '2026-10-22T08:55:00.000Z' },
    },
  });

  it('is active before its hard stop and expired at it', () => {
    expect(isImpersonating(impersonating, now)).toBe(true);
    expect(isImpersonating(impersonating, '2026-10-22T09:10:00.000Z')).toBe(false);
    expect(impersonationExpired(impersonating, '2026-10-22T09:10:00.000Z')).toBe(true);
  });

  it('refuses every capability once the support session has expired', () => {
    expect(sessionRefusal(impersonating, 'queue.view', '2026-10-22T09:10:00.000Z')?.code).toBe('impersonation_expired');
  });

  it('refuses the two forbidden capabilities while active but allows the queue', () => {
    for (const capability of ['payout.retry', 'account.sanction'] as const) {
      expect(
        sessionRefusal(impersonating, capability, now, { impersonationForbidden: ['payout.retry', 'account.sanction'] })?.code,
      ).toBe('impersonation_forbidden');
    }
    expect(sessionRefusal(impersonating, 'queue.view', now)).toBeNull();
  });
});
