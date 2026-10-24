import { useState } from 'react';
import { TextField } from '@nastech/design-system';
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
import { PasswordStep } from './password-step.js';
import { MagicLinkRequest } from './magic-link.js';
import { ResetRequest } from './reset-request.js';
import { PolicyLinks } from './policy-links.js';
import { goTo } from './fields.js';
import { S } from './styles.js';

/**
 * Sign-in, phone-first.
 *
 * The default path is: number → SMS code → in. Nothing else is required, ever. Password, magic
 * link and reset exist as *alternatives* for specific realities (shared phone, no SMS roaming),
 * and every one of them keeps the buyer on this route — a `critical` page: no scene runtime,
 * small code, works on a 3G connection with a cracked Android screen.
 *
 * CONTRACT-GAP: default api is the local fixture because the PHP Identity module does not exist
 * yet; the controller injects the HTTP implementation via the `api` prop when it lands.
 */

// A single fixture instance backs the no-prop case; two pages sharing it is realistic (one
// service, many clients) and keeps tests/demos from getting divergent worlds.
const fixtureFallback = createFakeAuthApi();

export interface SigninPageProps {
  api?: AuthApi;
  onAuthenticated?: (session: SessionInfo) => void;
  /** Compact = embedded under a guard (routes-guard), skips marketing-y links. */
  compact?: boolean;
}

type Phase = 'phone' | 'otp' | 'password' | 'magic' | 'reset';

export function SigninPage({ api = fixtureFallback.api, onAuthenticated, compact = false }: SigninPageProps) {
  const [phase, setPhase] = useState<Phase>('phone');
  const [e164, setE164] = useState('');
  const [ticket, setTicket] = useState<OtpTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [pwIdentifier, setPwIdentifier] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  function onPhone(e164next: string): void {
    setE164(e164next);
    void requestOtp(e164next);
  }

  async function requestOtp(number: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const t = await api.requestOtp({ e164: number });
      setTicket(t);
      setPhase('otp');
    } catch (e) {
      if (isAuthError(e) && e.code === 'rate_limited') {
        setError('Too many code requests for that number right now. Try password sign-in below, or wait about 15 minutes.');
      } else {
        setError(AUTH_ERROR_COPY[isAuthError(e) ? e.code : 'network']);
      }
    } finally {
      setBusy(false);
    }
  }

  function verified(session: SessionInfo): void {
    if (onAuthenticated) onAuthenticated(session);
    else goTo('/account');
  }

  async function passwordSubmit(password: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const { session } = await api.signInWithPassword({ identifier: pwIdentifier, password });
      verified(session);
    } catch (e) {
      setError(
        isAuthError(e) && e.code === 'rate_limited'
          ? 'Too many wrong passwords. Wait about 15 minutes, or sign in with a texted code.'
          : AUTH_ERROR_COPY[isAuthError(e) ? e.code : 'server'],
      );
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'reset') {
    return <ResetRequest api={api} onDone={() => setPhase('phone')} />;
  }

  if (phase === 'magic') {
    return <MagicLinkRequest api={api} onBack={() => setPhase('phone')} />;
  }

  if (phase === 'otp' && ticket !== null) {
    return (
      <OtpStep
        api={api}
        e164={e164}
        sentToMasked={ticket.sentToMasked}
        otpId={ticket.otpId}
        resendAfterSec={ticket.resendAfterSec}
        onVerified={verified}
        onBack={() => setPhase('phone')}
      />
    );
  }

  if (phase === 'password') {
    return (
      <div style={S.page} data-testid="signin-password-page">
        <h2 style={S.h1}>Password sign-in</h2>
        <TextField
          id="signin-identifier"
          label="Phone number or email"
          inputMode="tel"
          autoComplete="username"
          value={pwIdentifier}
          onChange={(v) => {
            setPwIdentifier(v);
            setError(undefined);
          }}
        />
        {error !== undefined ? (
          <p role="alert" style={S.alert} data-testid="signin-pw-error">
            {error}
          </p>
        ) : null}
        <PasswordStep
          title="Your password"
          autoComplete="current-password"
          onNext={(pw) => void passwordSubmit(pw)}
          onSkip={() => setPhase('phone')}
        />
      </div>
    );
  }

  // 'phone' — the primary path.
  return (
    <div style={S.page} data-testid="signin-page">
      <h1 style={S.h1}>Sign in or create an account</h1>
      <p style={S.p}>One number is all it takes. You get a code by SMS; that is the account.</p>
      {error !== undefined ? (
        <p role="alert" style={S.alert} data-testid="signin-error">
          {error}
        </p>
      ) : null}
      {busy && phase === 'phone' ? <p style={S.p}>Sending your code…</p> : null}
      {phase === 'phone' ? <PhoneStep onNext={onPhone} submitLabel={busy ? 'Sending…' : 'Get a code by SMS'} /> : null}
      {!compact ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          <button type="button" style={S.linkish} onClick={() => setPhase('password')} data-testid="alt-password">
            Sign in with a password
          </button>
          <button type="button" style={S.linkish} onClick={() => setPhase('magic')} data-testid="alt-magic">
            Email me a sign-in link
          </button>
          <button type="button" style={S.linkish} onClick={() => setPhase('reset')} data-testid="alt-reset">
            Forgot my password
          </button>
          <button type="button" style={S.linkish} onClick={() => goTo('/register')} data-testid="alt-register">
            New here? Create an account properly (optional email and settings)
          </button>
        </div>
      ) : null}
      {!compact ? <PolicyLinks /> : null}
    </div>
  );
}
