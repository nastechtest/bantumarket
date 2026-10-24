import { useEffect, useRef, useState } from 'react';
import { PinField, TextField } from '@nastech/design-system';
import { navigate } from '../../router.js';
import { maskEmail, maskPhone, parseIdentifier } from './identifier.js';
import { AuthError, AUTH_ERROR_COPY } from './api/auth-transport.js';
import type { AuthTicket, AuthTransport } from './api/auth-transport.js';
import { createFixtureAuthTransport } from './api/fixtures.js';
import { trustThisDevice } from './device-trust.js';
import { readSellerSession, writeSellerSession, type KeyValueStore, type SellerSession } from './session.js';

/**
 * `/sign-in` (class `critical`). No password, no scene runtime.
 *
 * Two steps: identifier, then a six-digit code. The seller is told which channel the code went to
 * in masked form, so a mistyped digit is visible before the code is typed. Device trust is opt-in
 * and described as what it is: a token on this phone, not proof of identity.
 */

export interface SignInPageProps {
  readonly transport?: AuthTransport;
  readonly navigateTo?: (path: string) => void;
  readonly onSignedIn?: (session: SellerSession) => void;
  readonly store?: KeyValueStore | null;
  readonly returnTo?: string;
  readonly now?: () => Date;
}

type Stage = 'identifier' | 'code' | 'success';

/** Rejects absolute URLs and protocol-relative paths: the only safe return is a path in this app. */
export function safeReturnTo(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/sign-in')) return '/';
  return raw;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function secondsUntil(instant: string, now: Date): number {
  const ms = Date.parse(instant) - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 1000);
}

const labelStyle: React.CSSProperties = { fontWeight: 600, fontSize: '0.875rem' };

export function SignInPage({
  transport,
  navigateTo = navigate,
  onSignedIn,
  store,
  returnTo,
  now = () => new Date(),
}: SignInPageProps) {
  const api = transport ?? defaultTransport();
  const online = useOnline();
  const [stage, setStage] = useState<Stage>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [remember, setRemember] = useState(true);
  const [ticket, setTicket] = useState<AuthTicket | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SellerSession | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const codeWrapRef = useRef<HTMLDivElement>(null);

  const destination = safeReturnTo(returnTo);

  useEffect(() => {
    if (error !== null) summaryRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (ticket === null) return;
    const tick = () => setResendIn(secondsUntil(ticket.resendAt, now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [ticket, now]);

  useEffect(() => {
    if (stage === 'code') codeWrapRef.current?.querySelector('input')?.focus();
  }, [stage]);

  function maskedDestination(): string {
    if (ticket !== null) return ticket.destination;
    const parsed = parseIdentifier(identifier);
    if (!parsed.ok) return identifier;
    return parsed.kind === 'email' ? maskEmail(parsed.value) : maskPhone(parsed.value);
  }

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault();
    setError(null);
    const parsed = parseIdentifier(identifier);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    if (!online) {
      setError('You are offline. Connect to a network to receive a sign-in code.');
      return;
    }
    setBusy(true);
    try {
      const issued = await api.requestCode(parsed);
      setTicket(issued);
      setCode('');
      setStage('code');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : AUTH_ERROR_COPY.network);
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (ticket === null) return;
    if (!/^\d{6}$/.test(code)) {
      setError('Enter all six digits of the code.');
      return;
    }
    if (!online) {
      setError('You are offline. The code needs a connection to be checked.');
      return;
    }
    setBusy(true);
    try {
      const signedIn = await api.verifyCode(ticket.ticketId, code);
      finish(signedIn);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : AUTH_ERROR_COPY.network);
    } finally {
      setBusy(false);
    }
  }

  function finish(signedIn: SellerSession) {
    const current = now();
    const lifetimeDays = remember ? 30 : 1;
    const bounded: SellerSession = {
      ...signedIn,
      signedInAt: current.toISOString(),
      expiresAt: new Date(current.getTime() + lifetimeDays * 24 * 60 * 60 * 1000).toISOString(),
    };
    writeSellerSession(bounded, store);
    if (remember) trustThisDevice({ now: current, ...(store === undefined ? {} : { store }) });
    setSession(bounded);
    setStage('success');
    onSignedIn?.(bounded);
  }

  function continueOn() {
    navigateTo(destination);
  }

  return (
    <section style={{ maxWidth: 460, margin: '0 auto', paddingTop: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <header>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-500)' }}>NasTech Market — sellers</p>
        <h1 style={{ marginTop: '4px' }}>{stage === 'success' ? 'You are signed in' : 'Sign in to sell'}</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--ink-500)' }}>
          {stage === 'identifier'
            ? 'Use the mobile number or email on your seller account. We send a six-digit code — there is no password to forget.'
            : stage === 'code'
              ? `We sent a six-digit code to ${maskedDestination()}. It expires in 10 minutes.`
              : 'Your session is open on this device.'}
        </p>
      </header>

      {error !== null ? (
        <div
          role="alert"
          tabIndex={-1}
          ref={summaryRef}
          data-testid="signin-error"
          style={{ border: '1px solid var(--neg)', borderRadius: '8px', padding: '12px', background: '#fff' }}
        >
          <strong>We could not sign you in.</strong>
          <p style={{ margin: '4px 0 0' }}>{error}</p>
        </div>
      ) : null}

      {!online ? (
        <p role="status" style={{ margin: 0, color: 'var(--caution)' }}>
          You are offline. Sign-in needs a connection.
        </p>
      ) : null}

      {stage === 'identifier' ? (
        <form onSubmit={requestCode} noValidate data-testid="signin-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <TextField
            label="Mobile number or email"
            value={identifier}
            onChange={setIdentifier}
            inputMode="text"
            autoComplete="username"
            hint="South African mobile numbers only for SMS. Email works too."
            {...(error !== null && identifier.trim() === '' ? { error: 'Enter your number or email.' } : {})}
          />
          <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', ...labelStyle, fontWeight: 400 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>
              Remember this device for 30 days.{' '}
              <span style={{ color: 'var(--ink-500)', fontWeight: 400 }}>
                It stores a token on this phone so you can skip the code. Remove it any time in Settings. It does not prove who you are.
              </span>
            </span>
          </label>
          <button type="submit" disabled={busy || !online}>
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
          {!online ? <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-500)' }}>The button is disabled until you reconnect.</p> : null}
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-500)' }}>
            By continuing you agree to the <a href="/terms">seller terms</a> and the <a href="/privacy">privacy notice</a>.
          </p>
        </form>
      ) : null}

      {stage === 'code' ? (
        <form onSubmit={verify} noValidate data-testid="signin-code-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div ref={codeWrapRef}>
            <PinField label="Six-digit code" value={code} onChange={setCode} />
          </div>
          <button type="submit" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || resendIn > 0}
            onClick={() => void requestCode()}
          >
            {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setStage('identifier');
              setTicket(null);
              setError(null);
            }}
          >
            Use a different number or email
          </button>
          {'demoHint' in api && typeof api.demoHint === 'string' ? (
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-500)' }} data-testid="demo-hint">
              {api.demoHint} — this demo has no SMS provider, so the code is printed here.
            </p>
          ) : null}
        </form>
      ) : null}

      {stage === 'success' && session !== null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} data-testid="signin-success">
          <p style={{ margin: 0 }}>
            Signed in as {session.displayName}. {online ? 'Your account is ready.' : 'You are offline; some screens will be limited until you reconnect.'}
          </p>
          <button type="button" onClick={continueOn}>
            Continue
          </button>
          <a href="/settings">Manage this device in Settings</a>
        </div>
      ) : null}
    </section>
  );
}

let fixtureTransport: AuthTransport | null = null;
function defaultTransport(): AuthTransport {
  fixtureTransport ??= createFixtureAuthTransport();
  return fixtureTransport;
}

/** True when a live session already exists — used by the route to skip the form. */
export function hasLiveSession(store?: KeyValueStore | null): boolean {
  if (store !== undefined) return readSellerSession(store) !== null;
  return readSellerSession() !== null;
}
