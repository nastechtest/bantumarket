import { describe, expect, it } from 'bun:test';
import { ActionRefused, runAuditedAction } from './audited-action.js';
import { fixtureSession } from './api/fixtures.js';
import type { AuditStamp } from './audit-stamp.js';

const now = '2026-10-22T09:00:00.000Z';
const session = fixtureSession({ role: 'admin' });

async function refusalOf(promise: Promise<unknown>): Promise<ActionRefused> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ActionRefused) return error;
    throw error;
  }
  throw new Error('expected the action to be refused');
}

describe('runAuditedAction', () => {
  it('passes a complete stamp to the transport and returns the result', async () => {
    let received: AuditStamp | null = null;
    const outcome = await runAuditedAction({
      session,
      capability: 'listing.review',
      target: 'lst_01',
      reason: 'Photos match the record',
      now,
      perform: async (stamp) => {
        received = stamp;
        return 'approved';
      },
    });
    expect(outcome.value).toBe('approved');
    expect(received).not.toBeNull();
    expect(received!.actor).toBe(session.operatorId);
    expect(received!.role).toBe('admin');
    expect(received!.target).toBe('lst_01');
  });

  it('refuses before the transport when the capability is missing', async () => {
    let called = false;
    const refused = await refusalOf(
      runAuditedAction({
        session: fixtureSession({ capabilities: ['queue.view'] }),
        capability: 'listing.takedown',
        target: 'lst_01',
        reason: 'Prohibited item',
        now,
        perform: async () => {
          called = true;
        },
      }),
    );
    expect(called).toBe(false);
    expect(refused.refusal.code).toBe('capability_missing');
  });

  it('refuses before the transport when the reason is empty', async () => {
    let called = false;
    const refused = await refusalOf(
      runAuditedAction({
        session,
        capability: 'listing.review',
        target: 'lst_01',
        reason: '   ',
        now,
        perform: async () => {
          called = true;
        },
      }),
    );
    expect(called).toBe(false);
    expect(refused.refusal.code).toBe('invalid_reason');
  });

  it('refuses payout retry under impersonation before the transport runs', async () => {
    const impersonating = fixtureSession({
      role: 'admin',
      impersonation: {
        operatorId: 'staff_thandi',
        targetId: 'seller_9',
        targetLabel: 'Ayesha K',
        reason: 'Support call',
        startedAt: '2026-10-22T08:50:00.000Z',
        expiresAt: '2026-10-22T09:20:00.000Z',
        stamp: { actor: 'staff_thandi', role: 'admin', target: 'seller_9', reason: 'Support call', at: '2026-10-22T08:50:00.000Z' },
      },
    });
    let called = false;
    const refused = await refusalOf(
      runAuditedAction({
        session: impersonating,
        capability: 'payout.retry',
        target: 'pay_77',
        reason: 'Retry failed payout',
        now,
        perform: async () => {
          called = true;
        },
      }),
    );
    expect(called).toBe(false);
    expect(refused.refusal.code).toBe('impersonation_forbidden');
  });

  it('refuses a sanction under impersonation, the second forbidden capability', async () => {
    const impersonating = fixtureSession({
      role: 'admin',
      impersonation: {
        operatorId: 'staff_thandi',
        targetId: 'seller_9',
        targetLabel: 'Ayesha K',
        reason: 'Support call',
        startedAt: '2026-10-22T08:50:00.000Z',
        expiresAt: '2026-10-22T09:20:00.000Z',
        stamp: { actor: 'staff_thandi', role: 'admin', target: 'seller_9', reason: 'Support call', at: '2026-10-22T08:50:00.000Z' },
      },
    });
    const refused = await refusalOf(
      runAuditedAction({
        session: impersonating,
        capability: 'account.sanction',
        target: 'seller_9',
        reason: 'Hold the account',
        now,
        perform: async () => undefined,
      }),
    );
    expect(refused.refusal.code).toBe('impersonation_forbidden');
  });

  it('refuses when the session is expired, even with every capability', async () => {
    const expired = fixtureSession({ role: 'admin', expiresAt: '2026-10-22T08:59:00.000Z' });
    const refused = await refusalOf(
      runAuditedAction({
        session: expired,
        capability: 'listing.review',
        target: 'lst_01',
        reason: 'Photos match the record',
        now,
        perform: async () => undefined,
      }),
    );
    expect(refused.refusal.code).toBe('session_expired');
  });
});
