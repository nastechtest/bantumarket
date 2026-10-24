import { useState } from 'react';
import type { FormEvent } from 'react';
import { TextField } from '@nastech/design-system';
import { parsePhone } from './phone.js';
import { emailError } from './fields.js';
import { goTo } from './fields.js';
import { isAuthError, type AuthApi } from './api/auth-transport.js';
import { S, buttonStyle } from './styles.js';
import { ResetConfirm } from './reset-confirm.js';

export interface ResetRequestProps {
  api: AuthApi;
  /** Called after the whole reset completes; defaults to navigating to /sign-in. */
  onDone?: (() => void) | undefined;
}

/**
 * Forgot-password entry. Phone or email — both work, because either may be the only thing the
 * account holds. The request answer is identical whether the identifier exists (anti-enumeration
 * lives at the transport; this screen repeats its promise honestly: "if it's on an account…").
 */
export function ResetRequest({ api, onDone }: ResetRequestProps) {
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<{ resetId: string; sentToMasked: string; resendAfterSec: number } | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (mode === 'phone') {
      const parsed = parsePhone(value);
      if (!parsed.ok || parsed.e164 === undefined) {
        setError(parsed.error ?? 'Enter a number.');
        return;
      }
      setBusy(true);
      try {
        const t = await api.requestPasswordReset({ e164: parsed.e164 });
        setTicket({ resetId: t.resetId, sentToMasked: t.sentToMasked, resendAfterSec: t.resendAfterSec });
      } catch (e) {
        setError(isAuthError(e) && e.code === 'rate_limited' ? 'Too many reset requests. Wait a while and try again.' : 'Could not send right now. Try once more.');
      } finally {
        setBusy(false);
      }
    } else {
      const err = emailError(value);
      if (err !== undefined || value.trim() === '') {
        setError(err ?? 'Enter your email.');
        return;
      }
      setBusy(true);
      try {
        const t = await api.requestPasswordReset({ email: value.trim() });
        setTicket({ resetId: t.resetId, sentToMasked: t.sentToMasked, resendAfterSec: t.resendAfterSec });
      } catch {
        setError('Could not send right now. Try once more.');
      } finally {
        setBusy(false);
      }
    }
  }

  if (ticket !== null) {
    return (
      <ResetConfirm
        api={api}
        resetId={ticket.resetId}
        sentToMasked={ticket.sentToMasked}
        onDone={() => {
          if (onDone) onDone();
          else goTo('/sign-in');
        }}
      />
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: S.page.gap }} data-testid="reset-request">
      <h2 style={S.h1}>Reset your password</h2>
      <p style={S.p}>
        We will send a code — {mode === 'phone' ? 'by SMS' : 'by email'} — and you set a new
        password with it. If the number or email is not on an account, you will still see this
        message; that is deliberate, it stops other people probing who is here.
      </p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => { setMode('phone'); setError(undefined); }}
          style={mode === 'phone' ? buttonStyle(true) : S.linkish}
          data-testid="reset-mode-phone"
          aria-pressed={mode === 'phone'}
        >
          By phone
        </button>
        <button
          type="button"
          onClick={() => { setMode('email'); setError(undefined); }}
          style={mode === 'email' ? buttonStyle(true) : S.linkish}
          data-testid="reset-mode-email"
          aria-pressed={mode === 'email'}
        >
          By email
        </button>
      </div>
      {mode === 'phone' ? (
        <TextField
          id="reset-phone"
          label="Phone number"
          inputMode="tel"
          autoComplete="tel"
          value={value}
          onChange={(v) => { setValue(v); setError(undefined); }}
          {...(error !== undefined ? { error } : {})}
        />
      ) : (
        <TextField
          id="reset-email"
          label="Email address"
          inputMode="email"
          autoComplete="email"
          value={value}
          onChange={(v) => { setValue(v); setError(undefined); }}
          {...(error !== undefined ? { error } : {})}
        />
      )}
      <button type="submit" disabled={busy} style={buttonStyle(!busy)} data-testid="reset-send">
        {busy ? 'Sending…' : 'Send me a reset code'}
      </button>
    </form>
  );
}
