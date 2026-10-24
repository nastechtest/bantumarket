import '../../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { SignInPage } from './signin-page.js';
import { createAuthFixture, FIXTURE_MFA_CODE, FIXTURE_PASSWORD } from './api/fixtures.js';
import { getStaffSession, resetStaffSessionForTests } from '../../shell/session-store.js';
import { resetOnlineForTests, setOnline } from '../../shell/connectivity.js';

afterEach(() => {
  cleanup();
  resetStaffSessionForTests();
  resetOnlineForTests();
});

type View = ReturnType<typeof render>;

function fillCredentials(view: View): void {
  fireEvent.input(view.getByLabelText('Staff email'), { target: { value: 'staff@nastech.test' } });
  fireEvent.input(view.getByLabelText('Password'), { target: { value: FIXTURE_PASSWORD } });
}

describe('staff sign-in', () => {
  it('shows the device history and requires credentials before anything else', async () => {
    const view = render(<SignInPage transport={createAuthFixture()} now="2026-10-22T09:00:00.000Z" />);
    await view.findByText(/has signed in before/);
    const button = view.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(view.getByText(/Enter both your staff email and password/)).toBeTruthy();
  });

  it('goes through MFA and only then stores a session with a second factor', async () => {
    const fixture = createAuthFixture();
    const view = render(<SignInPage transport={fixture} now="2026-10-22T09:00:00.000Z" />);
    await view.findByText(/has signed in before/);
    fillCredentials(view);
    fireEvent.click(view.getByRole('button', { name: 'Continue' }));

    expect(await view.findByRole('heading', { name: 'Second factor' })).toBeTruthy();
    expect(getStaffSession()).toBeNull();

    fireEvent.input(view.getByLabelText('6-digit code'), { target: { value: FIXTURE_MFA_CODE } });
    fireEvent.click(view.getByRole('button', { name: 'Continue' }));

    await view.findByText('Signed in');
    expect(fixture.calls).toEqual(['recogniseDevice', 'beginSignIn', 'verifyMfa']);
    expect(getStaffSession()?.mfaSatisfied).toBe(true);
  });

  it('refuses a transport response that signs a staff account in without a second factor', async () => {
    const fixture = createAuthFixture({ signInWithoutMfa: true });
    const view = render(<SignInPage transport={fixture} now="2026-10-22T09:00:00.000Z" />);
    await view.findByText(/has signed in before/);
    fillCredentials(view);
    fireEvent.click(view.getByRole('button', { name: 'Continue' }));

    expect(await view.findByText(/refuses that session/)).toBeTruthy();
    expect(getStaffSession()).toBeNull();
  });

  it('renders a refused sign-in without saying whether the account exists', async () => {
    const view = render(<SignInPage transport={createAuthFixture()} now="2026-10-22T09:00:00.000Z" />);
    await view.findByText(/has signed in before/);
    fireEvent.input(view.getByLabelText('Staff email'), { target: { value: 'nobody@nastech.test' } });
    fireEvent.input(view.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(view.getByRole('button', { name: 'Continue' }));

    expect(await view.findByText('Sign-in was refused.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/no such|not found|unknown account|does not exist/i);
  });

  it('does not accept a code for a different challenge', async () => {
    const fixture = createAuthFixture();
    const view = render(<SignInPage transport={fixture} now="2026-10-22T09:00:00.000Z" />);
    await view.findByText(/has signed in before/);
    fillCredentials(view);
    fireEvent.click(view.getByRole('button', { name: 'Continue' }));
    await view.findByRole('heading', { name: 'Second factor' });
    fireEvent.input(view.getByLabelText('6-digit code'), { target: { value: '000000' } });
    fireEvent.click(view.getByRole('button', { name: 'Continue' }));

    expect(await view.findByText('That code was not accepted.')).toBeTruthy();
    expect(getStaffSession()).toBeNull();
  });

  it('offers no sign-in while the browser is offline', async () => {
    setOnline(false);
    const view = render(<SignInPage transport={createAuthFixture()} now="2026-10-22T09:00:00.000Z" />);
    expect(view.getByText('You are offline')).toBeTruthy();
    expect(view.queryByLabelText('Staff email')).toBeNull();
  });
});
