import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { PinField } from '@nastech/design-system';
import { AUTH_ERROR_COPY, isAuthError, type AuthApi, type SessionInfo } from './api/auth-transport.js';
import {
  applyBlocked,
  applySend,
  formatCountdown,
  initialCooldown,
  resendDecisionAt,
  type CooldownState,
} from './resend-cooldown.js';
import { S, buttonStyle } from './styles.js';

export interface OtpStepProps {
  api: AuthApi;
  /** Real number for resend requests. `sentToMasked` is display-only; the mask never goes to the transport. */
  e164: string;
  sentToMasked: string;
  otpId: string;
  /** Server-issued cooldown after this send, seconds. */
  resendAfterSec: number;
  onVerified: (session: SessionInfo) => void;
  onBack?: (() => void) | undefined;
  /** Injectable clock; tests move time without moving real timers. Production: Date.now. */
  now?: () => number;
}

type Phase = 'enter' | 'expired' | 'exhausted' | 'blocked';

/**
 * The OTP screen. Every abnormal path is a screen a buyer can read, not a toast:
 * wrong code (field error + attempts left), expired, attempts exhausted, and server rate limit
 * each get their own state, because each needs a different next action — and because "generic
 * error" on an OTP form is how people start phoning support about a security feature.
 *
 * The code itself never round-trips through any string this component prints: errors are fixed
 * copy selected by code, and the typed value is only ever handed to the transport.
 */
export function OtpStep({ api, e164, sentToMasked, otpId, resendAfterSec, onVerified, onBack, now = () => Date.now() }: OtpStepProps) {
  const [phase, setPhase] = useState<Phase>('enter');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [attemptsLeft, setAttemptsLeft] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Resend can mint a different otpId (fresh ticket after exhaustion); verify must go to the
  // live one, so the id is state seeded from the prop, not a constant.
  const [activeOtpId, setActiveOtpId] = useState(otpId);
  const [cooldown, setCooldown] = useState<CooldownState>(() => initialCooldown(now(), resendAfterSec));
  const [, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A ticking countdown is the only timer this screen needs; it is 1 Hz and stops when nothing
  // is pending (interval churn on a low-end phone is battery and heat).
  const pending = resendDecisionAt(cooldown, now());
  const counting = pending.action !== 'allow' && (phase === 'enter' || phase === 'blocked' || phase === 'expired');
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [counting]);

  async function resend(): Promise<void> {
    const decision = resendDecisionAt(cooldown, now());
    if (decision.action !== 'allow') return; // the gate is the UI: no call, no wasted SMS
    setBusy(true);
    try {
      const ticket = await api.requestOtp({ e164 });
      if (!mounted.current) return;
      setActiveOtpId(ticket.otpId);
      setCooldown(applySend(cooldown, now(), ticket.resendAfterSec));
      setPhase('enter');
      setCode('');
      setFieldError(undefined);
      setAttemptsLeft(undefined);
    } catch (e) {
      if (!mounted.current) return;
      if (isAuthError(e) && e.code === 'rate_limited' && e.retryAfterSec !== undefined) {
        setCooldown(applyBlocked(cooldown, e.retryAfterSec, now()));
        setPhase('blocked');
      } else {
        setFieldError(AUTH_ERROR_COPY[isAuthError(e) ? e.code : 'server']);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const digits = code.replace(/\D/g, '');
    if (digits.length < 6) {
      setFieldError('Enter all 6 digits from the SMS.');
      return;
    }
    setBusy(true);
    try {
      const { session } = await api.verifyOtp({ otpId: activeOtpId, code: digits });
      if (!mounted.current) return;
      // A code that has been presented to the server does not stay in the DOM afterwards: success
      // means it is spent, failure means it should not be re-rendered (or shoulder-surfed).
      setCode('');
      onVerified(session);
    } catch (e) {
      if (!mounted.current) return;
      setCode('');
      if (isAuthError(e)) {
        switch (e.code) {
          case 'invalid_code':
            setFieldError(AUTH_ERROR_COPY.invalid_code);
            if (e.attemptsLeft !== undefined) setAttemptsLeft(e.attemptsLeft);
            break;
          case 'code_expired':
            setPhase('expired');
            break;
          case 'attempts_exhausted':
            setPhase('exhausted');
            break;
          case 'rate_limited':
            setCooldown(applyBlocked(cooldown, e.retryAfterSec ?? 60, now()));
            setPhase('blocked');
            break;
          default:
            setFieldError(AUTH_ERROR_COPY[e.code]);
        }
      } else {
        setFieldError(AUTH_ERROR_COPY.server);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  if (phase === 'blocked') {
    const secs = pending.action === 'blocked' ? pending.retryAfterSec : pending.action === 'wait' ? pending.afterSec : 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.page.gap }} data-testid="otp-blocked">
        <h2 style={S.h1}>Too many code requests</h2>
        <p style={S.p}>
          Codes for this number are being sent slowly for a while, to keep the SMS system honest. You can
          ask for another in <strong data-testid="blocked-countdown">{formatCountdown(secs)}</strong>. Nothing
          you did wrong — waiting is enough, or sign in another way.
        </p>
        <button type="button" onClick={() => void resend()} disabled={pending.action !== 'allow' || busy} style={buttonStyle(pending.action === 'allow' && !busy)}>
          Send another code
        </button>
        {onBack ? <button type="button" onClick={onBack} style={S.linkish}>Sign in another way</button> : null}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: S.page.gap }} data-testid="otp-step">
      <h2 style={S.h1}>Check your messages</h2>
      <p style={S.p}>We sent a 6-digit code to {sentToMasked}. It is valid for a few minutes.</p>
      {phase === 'expired' ? (
        <p role="alert" style={S.alert} data-testid="otp-expired">
          {AUTH_ERROR_COPY.code_expired} Ask for a new code below.
        </p>
      ) : null}
      {phase === 'exhausted' ? (
        <div role="alert" data-testid="otp-exhausted" style={S.alert}>
          <strong>Too many wrong attempts.</strong> This code is locked. That is what protects the
          account on this number. Get a fresh code below — the same code will keep failing.
        </div>
      ) : null}
      <PinField
        id="auth-otp"
        label="6-digit code"
        value={code}
        onChange={setCode}
        {...(fieldError !== undefined ? { error: fieldError } : {})}
      />
      {attemptsLeft !== undefined && attemptsLeft > 0 ? (
        <p style={S.p} data-testid="attempts-left">
          {attemptsLeft} {attemptsLeft === 1 ? 'attempt' : 'attempts'} left before this code locks.
        </p>
      ) : null}
      <button type="submit" disabled={busy} style={buttonStyle(!busy)} data-testid="otp-submit">
        {busy ? 'Checking…' : 'Verify code'}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
        <button
          type="button"
          onClick={() => void resend()}
          disabled={busy || pending.action !== 'allow'}
          style={S.linkish}
          data-testid={phase === 'exhausted' ? 'exhausted-new-code' : 'otp-resend'}
        >
          {pending.action === 'wait'
            ? `Resend code in ${formatCountdown(pending.afterSec)}`
            : pending.action === 'blocked'
              ? `Resend available in ${formatCountdown(pending.retryAfterSec)}`
              : phase === 'exhausted'
                ? 'Send me a new code'
                : 'Resend code'}
        </button>
        {onBack ? <button type="button" onClick={onBack} style={S.linkish}>Wrong number? Change it</button> : null}
      </div>
    </form>
  );
}
