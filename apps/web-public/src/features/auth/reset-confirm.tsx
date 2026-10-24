import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { PinField } from '@nastech/design-system';
import { AUTH_ERROR_COPY, isAuthError, type AuthApi } from './api/auth-transport.js';
import { scorePassword } from './strength.js';
import { raw, tokens } from '@nastech/design-tokens';
import { S, buttonStyle } from './styles.js';

export interface ResetConfirmProps {
  api: AuthApi;
  resetId: string;
  sentToMasked: string;
  onDone: () => void;
}

/**
 * Second half of password reset: code + new password in one screen, so a buyer whose code arrives
 * while the app is backgrounded doesn't lose it to a half-finished wizard.
 *
 * On success this signs the buyer in with a fresh session on purpose: a password reset is the
 * scenario where the old session should already be dead (the reset endpoint invalidates prior
 * sessions server-side — CONTRACT-GAP, stated in README), and creating the new one here avoids
 * the "reset done, now sign in again with the thing you just changed" loop.
 */
export function ResetConfirm({ api, resetId, sentToMasked, onDone }: ResetConfirmProps) {
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<{ code?: string; pw?: string }>({});
  const [busy, setBusy] = useState(false);
  const strength = useMemo(() => scorePassword(pw), [pw]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const errs: { code?: string; pw?: string } = {};
    if (code.replace(/\D/g, '').length < 6) errs.code = 'Enter the full code from the message.';
    if (pw === '') errs.pw = 'Type the new password.';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.confirmPasswordReset({ resetId, code: code.replace(/\D/g, ''), newPassword: pw });
      onDone();
    } catch (e) {
      if (isAuthError(e)) {
        // Code problems surface on the code field; everything else as a general alert. Fixed copy
        // only — the wrong code never becomes part of a rendered or logged string.
        if (e.code === 'invalid_code') setFieldErrors({ code: AUTH_ERROR_COPY.invalid_code });
        else if (e.code === 'code_expired') setFieldErrors({ code: AUTH_ERROR_COPY.code_expired });
        else if (e.code === 'attempts_exhausted') setError('Too many wrong attempts on this reset. Start the reset again.');
        else if (e.code === 'rate_limited') setError('Too many requests. Wait a few minutes before trying again.');
        else setError(AUTH_ERROR_COPY[e.code]);
      } else {
        setError(AUTH_ERROR_COPY.server);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: S.page.gap }} data-testid="reset-confirm">
      <h2 style={S.h1}>New password</h2>
      <p style={S.p}>Enter the code we sent to {sentToMasked} and the password you want from now on.</p>
      <PinField
        id="reset-code"
        label="Reset code"
        value={code}
        onChange={setCode}
        {...(fieldErrors.code !== undefined ? { error: fieldErrors.code } : {})}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1 }}>
        <label htmlFor="reset-pw" style={{ color: tokens.text.primary, fontSize: '0.875rem', fontWeight: 600, fontFamily: raw.type.familyText }}>
          New password
        </label>
        <input
          id="reset-pw"
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          data-testid="reset-password-input"
          style={{
            border: `1px solid ${fieldErrors.pw !== undefined ? raw.color.signalNegative : raw.color.ink300}`,
            borderRadius: raw.radius.sm,
            padding: `${raw.space.s2} ${raw.space.s3}`,
            fontSize: '1rem',
            fontFamily: raw.type.familyText,
          }}
        />
        {fieldErrors.pw !== undefined ? (
          <p role="alert" style={{ margin: 0, color: raw.color.signalNegative, fontSize: '0.8125rem' }}>
            {fieldErrors.pw}
          </p>
        ) : null}
      </div>
      {pw !== '' ? (
        <p style={{ ...S.p, fontSize: '0.8125rem' }} data-testid="reset-strength">
          Strength: {strength.label}. {strength.advice[0] ?? 'That looks fine.'}
        </p>
      ) : null}
      {error !== undefined ? (
        <p role="alert" style={S.alert} data-testid="reset-alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} style={buttonStyle(!busy)} data-testid="reset-submit">
        {busy ? 'Setting it…' : 'Set new password'}
      </button>
    </form>
  );
}
