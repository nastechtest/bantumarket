import { describe, expect, it } from 'bun:test';
import './test-dom.js';
import { RegisterPage } from './register-page.js';
import { ConsentStep } from './consent-step.js';
import { createFakeAuthApi, FIXTURE_LIMITS } from './api/fixtures.js';
import { AuthError, type SessionInfo } from './api/auth-transport.js';
import { byTestId, click, findButton, inputByLabel, mount, text, typeInto } from './test-dom.js';
import type { Mounted } from './test-dom.js';

/**
 * Registration is the deliberate path; the product rule under test is that it is completable
 * with ONLY a phone and a code — email, password and marketing are all skippable, and the
 * account exists only with fresh proof-of-phone plus the two required consents.
 */

const E164 = '+27820000333';

async function walkToOtp(m: Mounted, number = '082 000 0333'): Promise<void> {
  await typeInto(inputByLabel(m.container, 'Your phone number'), number);
  await click(findButton(m.container, 'Get a code by SMS'));
  await m.flush();
}

async function passOtp(m: Mounted, code: string): Promise<void> {
  await typeInto(inputByLabel(m.container, '6-digit code'), code);
  await click(findButton(m.container, 'Verify code'));
  await m.flush();
}

async function toConsent(m: Mounted, h: ReturnType<typeof createFakeAuthApi>): Promise<void> {
  await walkToOtp(m);
  await passOtp(m, h.outbox[0]!.code);
  await click(findButton(m.container, 'Skip for now')); // email is optional
  await click(findButton(m.container, 'Skip — I will use texted codes')); // password is optional
}

describe('register-page', () => {
  it('phone + code + skip + skip + two consents = account. Nothing else required.', async () => {
    const h = createFakeAuthApi();
    const done: SessionInfo[] = [];
    const m = mount(<RegisterPage api={h.api} onRegistered={(s) => done.push(s)} />);
    await m.flush();
    await toConsent(m, h);
    expect(m.container.querySelector('[data-testid="consent-step"]')).not.toBeNull();
    await click(byTestId(m.container, 'consent-terms'));
    await click(byTestId(m.container, 'consent-privacy'));
    await click(findButton(m.container, 'Create account'));
    await m.flush();
    expect(m.container.querySelector('[data-testid="register-done"]')).not.toBeNull();
    expect(done).toHaveLength(1);
    expect(h.userExists(E164)).toBe(true);
    expect(done[0]!.email).toBeUndefined(); // skipped email is not silently collected
    m.unmount();
  });

  it('marketing is opt-in with an explicit default-off', async () => {
    const h = createFakeAuthApi();
    const m = mount(<RegisterPage api={h.api} />);
    await m.flush();
    await toConsent(m, h);
    expect((byTestId(m.container, 'consent-marketing') as HTMLInputElement).checked).toBe(false);
    expect((byTestId(m.container, 'consent-submit') as HTMLButtonElement).disabled).toBe(true);
    m.unmount();
  });

  it('weak-but-legal password can be set — the meter advises, registration proceeds', async () => {
    const h = createFakeAuthApi();
    const done: SessionInfo[] = [];
    const m = mount(<RegisterPage api={h.api} onRegistered={(s) => done.push(s)} />);
    await m.flush();
    await walkToOtp(m);
    await passOtp(m, h.outbox[0]!.code);
    await click(findButton(m.container, 'Skip for now')); // email
    await typeInto(inputByLabel(m.container, 'Password'), 'ilovebraai');
    expect(text(byTestId(m.container, 'strength-meter'))).toMatch(/advice only/i);
    expect((byTestId(m.container, 'password-continue') as HTMLButtonElement).disabled).toBe(false);
    await click(findButton(m.container, 'Use this password'));
    await click(byTestId(m.container, 'consent-terms'));
    await click(byTestId(m.container, 'consent-privacy'));
    await click(findButton(m.container, 'Create account'));
    await m.flush();
    expect(done).toHaveLength(1);
    // And the password actually works for sign-in afterwards.
    const { session } = await h.api.signInWithPassword({ identifier: E164, password: 'ilovebraai' });
    expect(session.e164).toBe(E164);
    m.unmount();
  });

  it('a taken number bounces back to the phone step with honest copy', async () => {
    const h = createFakeAuthApi();
    h.seedUser(E164, {});
    const m = mount(<RegisterPage api={h.api} />);
    await m.flush();
    await toConsent(m, h);
    await click(byTestId(m.container, 'consent-terms'));
    await click(byTestId(m.container, 'consent-privacy'));
    await click(findButton(m.container, 'Create account'));
    await m.flush();
    expect(text(m.container)).toMatch(/already uses this number/i);
    expect(m.container.querySelector('[data-testid="phone-step"]')).not.toBeNull();
    m.unmount();
  });

  it('registration refuses without proof-of-phone at the transport, not just in the UI', async () => {
    const h = createFakeAuthApi();
    await expect(
      h.api.register({
        e164: '+27820000444',
        verifiedOtpId: 'otp_does_not_exist',
        marketingOptIn: false,
        acceptedTerms: true,
        acceptedPrivacyNotice: true,
      }),
    ).rejects.toMatchObject({ code: 'phone_unverified' });
  });

  it('an expired verification proof is stale, not enough', async () => {
    const h = createFakeAuthApi();
    const t = await h.api.requestOtp({ e164: E164 });
    await h.api.verifyOtp({ otpId: t.otpId, code: h.outbox[0]!.code });
    h.clock.advance(FIXTURE_LIMITS.verifyStaleMs + 1000);
    await expect(
      h.api.register({
        e164: E164,
        verifiedOtpId: t.otpId,
        marketingOptIn: false,
        acceptedTerms: true,
        acceptedPrivacyNotice: true,
      }),
    ).rejects.toMatchObject({ code: 'phone_unverified' });
  });

  it('email step rejects malformed email but the skip path stays open', async () => {
    const h = createFakeAuthApi();
    const m = mount(<RegisterPage api={h.api} />);
    await m.flush();
    await walkToOtp(m);
    await passOtp(m, h.outbox[0]!.code);
    await typeInto(inputByLabel(m.container, 'Email address'), 'not-an-email');
    await click(findButton(m.container, 'Save email'));
    expect(text(m.container)).toMatch(/does not look like an email/i);
    expect(m.container.querySelector('[data-testid="email-step"]')).not.toBeNull();
    await click(findButton(m.container, 'Skip for now'));
    expect(m.container.querySelector('[data-testid="password-step"]')).not.toBeNull();
    m.unmount();
  });

  it('AuthError messages never contain user input', () => {
    const e = AuthError.of('invalid_code', { attemptsLeft: 3 });
    expect(e.message).toBe('auth:invalid_code');
    expect(e.message).not.toMatch(/undefined|null|\d{6}/);
  });
});

describe('consent-step standalone', () => {
  it('submit gated until BOTH required boxes; marketing never required', async () => {
    const seen: { acceptedTerms: boolean; acceptedPrivacyNotice: boolean; marketingOptIn: boolean }[] = [];
    const m = mount(<ConsentStep onSubmit={(c) => seen.push(c)} />);
    await m.flush();
    await click(byTestId(m.container, 'consent-terms'));
    expect((byTestId(m.container, 'consent-submit') as HTMLButtonElement).disabled).toBe(true);
    await click(byTestId(m.container, 'consent-privacy'));
    expect((byTestId(m.container, 'consent-submit') as HTMLButtonElement).disabled).toBe(false);
    await click(findButton(m.container, 'Create account'));
    expect(seen).toEqual([{ acceptedTerms: true, acceptedPrivacyNotice: true, marketingOptIn: false }]);
    m.unmount();
  });
});
