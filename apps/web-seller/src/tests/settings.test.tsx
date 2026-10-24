import { describe, expect, it } from 'bun:test';
import './dom-setup.js';
import { AppShell } from '../layout/shell.js';
import { createSellerSessionStore } from '../lib/session.js';
import { Routes } from '../router.js';
import { SettingsPage } from '../features/settings/settings-page.js';
import { click, mount, textOf } from './mount.js';

function settingsRoute() {
  const route = Routes.find((candidate) => candidate.path === '/settings');
  if (route === undefined) throw new Error('Routes has no /settings');
  return route;
}

function checkboxFor(container: HTMLElement, label: string): HTMLInputElement {
  const wrapper = [...container.querySelectorAll('label')].find((candidate) =>
    (candidate.textContent ?? '').includes(label),
  );
  const input = wrapper?.querySelector('input[type="checkbox"]');
  if (!(input instanceof HTMLInputElement)) throw new Error(`no checkbox for "${label}"`);
  return input;
}

describe('settings screen', () => {
  it('shows the seller profile, the tier label and a masked bank destination', async () => {
    const mounted = mount(<SettingsPage />);
    const body = textOf(mounted.container);
    expect(body).toContain('Settings');
    expect(body).toContain('Pieter van Wyk');
    expect(body).toContain('ID checked');
    expect(body).toContain('FNB Business •••• 4821');
    expect(body).not.toContain('62012345678');
    mounted.unmount();
  });

  it('lets the seller change a real notification choice', async () => {
    const mounted = mount(<SettingsPage />);
    const payouts = checkboxFor(mounted.container, 'A payout is sent');
    expect(payouts.checked).toBe(true);
    await click(payouts);
    expect(checkboxFor(mounted.container, 'A payout is sent').checked).toBe(false);
    mounted.unmount();
  });

  it('does not pretend a device token proves identity', async () => {
    const mounted = mount(<SettingsPage />);
    const body = textOf(mounted.container);
    expect(body).toContain('not proof of who you are');
    expect(body).not.toMatch(/\bverified\b/i);
    mounted.unmount();
  });
});

describe('settings without a session', () => {
  it('redirects an anonymous visitor to sign-in and never renders the account form', async () => {
    const mounted = mount(
      <AppShell
        route={settingsRoute()}
        activePath="/settings"
        routes={Routes}
        sessionStore={createSellerSessionStore({ status: 'anonymous' })}
        navigate={() => {}}
        onSignOut={() => {}}
        support={null}
      >
        <SettingsPage />
      </AppShell>,
    );
    await mounted.flush();
    const body = textOf(mounted.container);
    expect(body).toContain('Taking you to sign in');
    expect(body).not.toContain('Pieter van Wyk');
    expect(body).not.toContain('FNB Business');
    mounted.unmount();
  });
});
