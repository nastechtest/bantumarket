import { describe, expect, it } from 'bun:test';
import './dom-setup.js';
import { AppShell } from '../layout/shell.js';
import { createSellerSessionStore } from '../lib/session.js';
import { Routes } from '../router.js';
import { PayoutsPage } from '../features/payouts/payouts-page.js';
import { mount, textOf } from './mount.js';

function payoutsRoute() {
  const route = Routes.find((candidate) => candidate.path === '/payouts');
  if (route === undefined) throw new Error('Routes has no /payouts');
  return route;
}

describe('payouts screen', () => {
  it('names the R270 capture cost, the 0% seller fee and the R2,700 break-even', async () => {
    const mounted = mount(<PayoutsPage />);
    const body = textOf(mounted.container);
    expect(body).toContain('Payouts');
    expect(body).toContain('Payable now');
    expect(body).toContain('R3,890');
    expect(body).toContain('R270');
    expect(body).toContain('0%');
    expect(body).toContain('R2,700');
    expect(body).toContain('R270 per capture, 0% seller fee, break-even R2,700');
    mounted.unmount();
  });

  it('shows a masked payout destination and never a full account number', async () => {
    const mounted = mount(<PayoutsPage />);
    const body = textOf(mounted.container);
    expect(body).toContain('FNB Business •••• 4821');
    expect(body).toContain('Masked account');
    expect(body).not.toContain('62012345678');
    expect(body).not.toMatch(/\b\d{8,}\b/);
    mounted.unmount();
  });

  it('explains the returned payout instead of presenting the money as lost', async () => {
    const mounted = mount(<PayoutsPage />);
    const body = textOf(mounted.container);
    expect(body).toContain('returned by the bank');
    expect(body).toContain('still yours');
    mounted.unmount();
  });
});

describe('payouts without a session', () => {
  it('redirects an anonymous visitor to sign-in and never renders the money surface', async () => {
    const mounted = mount(
      <AppShell
        route={payoutsRoute()}
        activePath="/payouts"
        routes={Routes}
        sessionStore={createSellerSessionStore({ status: 'anonymous' })}
        navigate={() => {}}
        onSignOut={() => {}}
        support={null}
      >
        <PayoutsPage />
      </AppShell>,
    );
    await mounted.flush();
    const body = textOf(mounted.container);
    expect(body).toContain('Taking you to sign in');
    expect(body).not.toContain('Payout history');
    expect(body).not.toContain('FNB Business');
    mounted.unmount();
  });
});
