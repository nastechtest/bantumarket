import { useState } from 'react';
import {
  AUTH_ERROR_COPY,
  isAuthError,
  type AuthApi,
  type OtpTicket,
  type SessionInfo,
} from './api/auth-transport.js';
import { createFakeAuthApi } from './api/fixtures.js';
import { PhoneStep } from './phone-step.js';
import { OtpStep } from './otp-step.js';
import { EmailStep } from './email-step.js';
import { PasswordStep } from './password-step.js';
import { ConsentStep, type ConsentInput } from './consent-step.js';
import { formatPhone } from './phone.js';
import { goTo } from './fields.js';
import { S } from './styles.js';

/**
 * Registration: a slower, more deliberate path than sign-in (which already works with just a
 * phone + code by product design). Order is phone → OTP → email (optional) → password (optional)
 * → consent, and the phone proof must be fresh when `register` is called — the server refuses an
 * account without proof-of-phone, so the client never tries.
 *
 * CONTRACT-GAP: default api is the local fixture; no Identity endpoint exists yet.
 */

const fixtureFallback = createFakeAuthApi();

export interface RegisterPageProps {
  api?: AuthApi;
  onRegistered?: (session: SessionInfo) => void;
}

type Phase = 'phone' | 'otp' | 'email' | 'password' | 'consent' | 'done';

interface Draft {
  e164: string;
  verifiedOtpId: string | null;
  email: string;
  password: string;
}

export function RegisterPage({ api = fixtureFallback.api, onRegistered }: RegisterPageProps) {
  const [phase, setPhase] = useState<Phase>('phone');
  const [draft, setDraft] = useState<Draft>({ e164: '', verifiedOtpId: null, email: '', password: '' });
  const [ticket, setTicket] = useState<OtpTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [session, setSession] = useState<SessionInfo | null>(null);
  // The strength check wants the local part only; an email step that was skipped has none, and
  // strength.ts treats absent as "no identity string to match" rather than as the empty string.
  const emailLocal = draft.email.includes('@') ? draft.email.slice(0, draft.email.indexOf('@')) : undefined;

  async function startOtp(e164: string): Promise<void> {
    setDraft((d) => ({ ...d, e164 }));
    setBusy(true);
    setError(undefined);
    try {
      const t = await api.requestOtp({ e164 });
      setTicket(t);
      setPhase('otp');
    } catch (e) {
      setError(AUTH_ERROR_COPY[isAuthError(e) ? e.code : 'network']);
    } finally {
      setBusy(false);
    }
  }

  async function finish(consent: ConsentInput): Promise<void> {
    if (draft.verifiedOtpId === null) {
      setError('Verify your number first.');
      setPhase('phone');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const { session: s } = await api.register({
        e164: draft.e164,
        verifiedOtpId: draft.verifiedOtpId,
        email: draft.email,
        password: draft.password,
        marketingOptIn: consent.marketingOptIn,
        acceptedTerms: consent.acceptedTerms,
        acceptedPrivacyNotice: consent.acceptedPrivacyNotice,
      });
      setSession(s);
      setPhase('done');
      if (onRegistered) onRegistered(s);
    } catch (e) {
      setError(AUTH_ERROR_COPY[isAuthError(e) ? e.code : 'server']);
      if (isAuthError(e) && e.code === 'phone_taken') setPhase('phone');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'done' && session !== null) {
    return (
      <div style={S.page} data-testid="register-done">
        <h1 style={S.h1}>You're in</h1>
        <p style={S.p}>
          Account created for {formatPhone(session.e164)}. Start with one watch — verifying your ID
          later lifts what you can sell, not what you can buy.
        </p>
        <button type="button" style={S.linkish} onClick={() => goTo('/account')}>
          Go to my account
        </button>
      </div>
    );
  }

  if (phase === 'otp' && ticket !== null) {
    return (
      <div style={S.page}>
        <h1 style={S.h1}>Confirm it's your phone</h1>
        <OtpStep
          api={api}
          e164={draft.e164}
          sentToMasked={ticket.sentToMasked}
          otpId={ticket.otpId}
          resendAfterSec={ticket.resendAfterSec}
          onVerified={(s) => {
            // Keep the proof-of-phone ticket: registration must present it (see auth-transport).
            setDraft((d) => ({ ...d, verifiedOtpId: ticket.otpId }));
            setSession(s);
            setPhase('email');
          }}
          onBack={() => setPhase('phone')}
        />
      </div>
    );
  }

  return (
    <div style={S.page} data-testid="register-page">
      <h1 style={S.h1}>Create your account</h1>
      {error !== undefined ? (
        <p role="alert" style={S.alert} data-testid="register-error">
          {error}
        </p>
      ) : null}
      {phase === 'phone' ? (
        <>
          <p style={S.p}>Step 1 of 5 — your number. Steps 2–5 are quick, and only the number is required.</p>
          {busy ? <p style={S.p}>Sending your code…</p> : null}
          <PhoneStep onNext={(e164) => void startOtp(e164)} submitLabel={busy ? 'Sending…' : 'Get a code by SMS'} />
          <p style={S.p}>
            Already have an account?{' '}
            <button type="button" style={S.linkish} onClick={() => goTo('/sign-in')}>
              Sign in
            </button>
          </p>
        </>
      ) : null}
      {phase === 'email' ? (
        <>
          <p style={S.p}>Step 3 of 5 — email is optional. Your number is the account.</p>
          <EmailStep
            initialValue={draft.email}
            onNext={(email) => {
              setDraft((d) => ({ ...d, email }));
              setPhase('password');
            }}
            onSkip={() => setPhase('password')}
          />
        </>
      ) : null}
      {phase === 'password' ? (
        <>
          <p style={S.p}>Step 4 of 5 — password is optional too. Codes by SMS always work.</p>
          <PasswordStep
            context={{ phoneDigits: draft.e164, ...(emailLocal !== undefined ? { emailLocal } : {}) }}
            onNext={(password) => {
              setDraft((d) => ({ ...d, password }));
              setPhase('consent');
            }}
            onSkip={() => setPhase('consent')}
          />
        </>
      ) : null}
      {phase === 'consent' ? (
        <>
          <p style={S.p}>Step 5 of 5 — the legal part.</p>
          <ConsentStep onSubmit={(c) => void finish(c)} busy={busy} />
        </>
      ) : null}
    </div>
  );
}
