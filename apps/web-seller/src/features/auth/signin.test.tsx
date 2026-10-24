import { describe, expect, it } from 'bun:test';
import './test-dom.js';
import { SignInPage } from './signin-page.js';
import { MagicLinkReturn } from './magic-link-return.js';
import { createFixtureAuthTransport, DEMO_SIGN_IN_CODE } from './api/fixtures.js';
import { memoryStore, readSellerSession, SESSION_STORAGE_KEY } from './session.js';
import { readDeviceTrust } from './device-trust.js';
import {
  activeElement,
  byTestId,
  flush,
  inputByLabel,
  mount,
  submitForm,
  text,
  typeInto,
  win,
} from './test-dom.js';

const NOW = new Date('2026-10-16T12:00:00+02:00');
const clock = () => NOW;

describe('seller sign-in', () => {
  it('starts on the identifier step and explains that there is no password', () => {
    const m = mount(<SignInPage transport={createFixtureAuthTransport({ latencyMs: 0 })} now={clock} store={memoryStore()} />);
    expect(text(m.container)).toContain('Sign in to sell');
    expect(text(m.container)).toMatch(/no password/i);
    expect(inputByLabel(m.container, 'Mobile number or email')).not.toBeNull();
    m.unmount();
  });

  it('empty submit shows an error summary and moves focus to it', async () => {
    const m = mount(<SignInPage transport={createFixtureAuthTransport()} now={clock} store={memoryStore()} />);
    await submitForm(m.container, 'signin-form');
    const summary = byTestId(m.container, 'signin-error');
    expect(summary).not.toBeNull();
    expect(activeElement()).toBe(summary);
    expect(text(summary)).toMatch(/enter your mobile/i);
    m.unmount();
  });

  it('refuses a landline before spending an SMS', async () => {
    const transport = createFixtureAuthTransport();
    const m = mount(<SignInPage transport={transport} now={clock} store={memoryStore()} />);
    await typeInto(inputByLabel(m.container, 'Mobile number or email')!, '011 234 5678');
    await submitForm(m.container, 'signin-form');
    expect(text(byTestId(m.container, 'signin-error'))).toMatch(/landline/i);
    expect(transport.issuedCodes()).toBe(0);
    m.unmount();
  });

  it('sends a code, masks the destination, and starts the resend cooldown', async () => {
    const transport = createFixtureAuthTransport();
    const m = mount(<SignInPage transport={transport} now={clock} store={memoryStore()} />);
    await typeInto(inputByLabel(m.container, 'Mobile number or email')!, '082 123 4567');
    await submitForm(m.container, 'signin-form');
    await m.flush();
    expect(transport.issuedCodes()).toBe(1);
    expect(text(m.container)).toContain('082 ••• 67');
    expect(text(m.container)).not.toContain('1234567');
    const resend = Array.from(m.container.querySelectorAll('button')).find((b) => text(b).startsWith('Send a new code in'));
    expect(resend).not.toBeUndefined();
    expect(resend!.disabled).toBe(true);
    m.unmount();
  });

  it('a wrong code is refused in place, with focus on the summary', async () => {
    const transport = createFixtureAuthTransport();
    const store = memoryStore();
    const m = mount(<SignInPage transport={transport} now={clock} store={store} />);
    await typeInto(inputByLabel(m.container, 'Mobile number or email')!, '082 123 4567');
    await submitForm(m.container, 'signin-form');
    await m.flush();
    await typeInto(inputByLabel(m.container, 'Six-digit code')!, '000000');
    await submitForm(m.container, 'signin-code-form');
    await m.flush();
    expect(text(byTestId(m.container, 'signin-error'))).toMatch(/not right/i);
    expect(activeElement()).toBe(byTestId(m.container, 'signin-error'));
    expect(readSellerSession(store, NOW)).toBeNull();
    m.unmount();
  });

  it('the correct code opens a session, trusts the device and shows success', async () => {
    const transport = createFixtureAuthTransport();
    const store = memoryStore();
    const seen: string[] = [];
    const m = mount(
      <SignInPage transport={transport} now={clock} store={store} onSignedIn={(s) => seen.push(s.sellerId)} returnTo="/payouts" />,
    );
    await typeInto(inputByLabel(m.container, 'Mobile number or email')!, '082 123 4567');
    await submitForm(m.container, 'signin-form');
    await m.flush();
    await typeInto(inputByLabel(m.container, 'Six-digit code')!, DEMO_SIGN_IN_CODE);
    await submitForm(m.container, 'signin-code-form');
    await m.flush();

    expect(byTestId(m.container, 'signin-success')).not.toBeNull();
    expect(text(m.container)).toContain('You are signed in');
    expect(seen).toEqual(['usr_seller_pieter']);
    expect(readSellerSession(store, NOW)?.phone).toBe('+27821234567');
    expect(readDeviceTrust(store, NOW)).not.toBeNull();
    expect(store.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    m.unmount();
  });

  it('does not trust the device when the seller opts out, and the session is short', async () => {
    const transport = createFixtureAuthTransport();
    const store = memoryStore();
    const m = mount(<SignInPage transport={transport} now={clock} store={store} />);
    await typeInto(inputByLabel(m.container, 'Mobile number or email')!, 'pieter@example.co.za');
    const checkbox = m.container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.click();
    await submitForm(m.container, 'signin-form');
    await m.flush();
    await typeInto(inputByLabel(m.container, 'Six-digit code')!, DEMO_SIGN_IN_CODE);
    await submitForm(m.container, 'signin-code-form');
    await m.flush();
    expect(readDeviceTrust(store, NOW)).toBeNull();
    const session = readSellerSession(store, NOW);
    expect(Date.parse(session!.expiresAt) - Date.parse(session!.signedInAt)).toBe(24 * 60 * 60 * 1000);
    m.unmount();
  });

  it('disables submission while offline and says why', async () => {
    const m = mount(<SignInPage transport={createFixtureAuthTransport()} now={clock} store={memoryStore()} />);
    await flush(() => win.dispatchEvent(new win.Event('offline')));
    expect(text(m.container)).toContain('You are offline.');
    const send = Array.from(m.container.querySelectorAll('button')).find((b) => text(b) === 'Send me a code')!;
    expect(send.disabled).toBe(true);
    await flush(() => win.dispatchEvent(new win.Event('online')));
    m.unmount();
  });

  it('never uses the word "verified" for a contact channel or a session', async () => {
    const m = mount(<SignInPage transport={createFixtureAuthTransport()} now={clock} store={memoryStore()} />);
    expect(text(m.container)).not.toMatch(/verified|guaranteed/i);
    m.unmount();
  });
});

describe('magic-link landing', () => {
  it('consumes a valid token once and opens a session', async () => {
    const store = memoryStore();
    const transport = createFixtureAuthTransport();
    const m = mount(<MagicLinkReturn transport={transport} href="http://localhost/sign-in?token=ml_demo_nomsa" store={store} />);
    await m.flush();
    expect(text(m.container)).toContain('You are signed in');
    expect(readSellerSession(store, NOW)).not.toBeNull();
    m.unmount();
  });

  it('an expired token is a real error with the way back in', async () => {
    const m = mount(<MagicLinkReturn transport={createFixtureAuthTransport()} href="http://localhost/sign-in?token=old" store={memoryStore()} />);
    await m.flush();
    const alert = byTestId(m.container, 'magic-link-error');
    expect(text(alert)).toMatch(/expired/i);
    expect(activeElement()).toBe(alert);
    expect(text(m.container)).toContain('Sign in with a code');
    m.unmount();
  });

  it('never prints the token it consumed', async () => {
    const m = mount(<MagicLinkReturn transport={createFixtureAuthTransport()} href="http://localhost/sign-in?token=ml_demo_nomsa" store={memoryStore()} />);
    await m.flush();
    expect(m.container.innerHTML).not.toContain('ml_demo_nomsa');
    m.unmount();
  });
});
