import { describe, expect, it } from 'bun:test';
import { fixtureSession } from './api/fixtures.js';
import { askRoleFor, capabilityRows, whoAmIRefusal } from './who-am-i.js';
import { createFailingShellTransport } from './api/fixtures.js';

const now = '2026-10-22T09:00:00.000Z';

describe('identity', () => {
  it('lists exactly the capabilities the server granted', () => {
    const session = fixtureSession({ capabilities: ['queue.view', 'listing.review'] });
    const rows = capabilityRows(session);
    expect(rows.map((row) => row.capability)).toEqual(['queue.view', 'listing.review']);
    expect(rows.every((row) => row.granted)).toBe(true);
  });

  it('refuses a route the session has no capability for', () => {
    const session = fixtureSession({ capabilities: ['queue.view'] });
    const refusal = whoAmIRefusal(session, '/audit', now);
    expect(refusal?.reason).toBe('Your role does not include this.');
    expect(refusal?.capability).toBe('audit.view');
  });

  it('refuses an audit route during impersonation', () => {
    const session = fixtureSession({
      role: 'admin',
      impersonation: {
        operatorId: 'staff_thandi',
        targetId: 'user_42',
        targetLabel: 'Sipho Ndlovu',
        reason: 'Support call',
        startedAt: '2026-10-22T08:55:00.000Z',
        expiresAt: '2026-10-22T09:20:00.000Z',
        stamp: { actor: 'staff_thandi', role: 'admin', target: 'user_42', reason: 'Support call', at: '2026-10-22T08:55:00.000Z' },
      },
    });
    expect(whoAmIRefusal(session, '/audit', now)?.reason).toContain('Impersonating');
  });

  it('asks for a role by capability, never by route', () => {
    expect(askRoleFor('account.sanction')).toBe('Risk analyst');
    expect(askRoleFor(null)).toBe('Console administrator');
  });

  it('surfaces an identity outage rather than inventing a session', async () => {
    const transport = createFailingShellTransport();
    await expect(transport.whoAmI()).rejects.toThrow('Identity service did not answer.');
    await expect(transport.capabilities()).rejects.toThrow('Capability list did not load.');
  });
});
