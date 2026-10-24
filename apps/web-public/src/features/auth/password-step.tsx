import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { scorePassword } from './strength.js';
import { raw, tokens } from '@nastech/design-tokens';
import { S, buttonStyle } from './styles.js';

export interface PasswordStepProps {
  onNext: (password: string) => void;
  /**
   * Optional by product rule: an account with phone + OTP can buy a watch today. A password is
   * an extra door, never a toll.
   */
  onSkip: () => void;
  context?: { phoneDigits?: string; emailLocal?: string; name?: string };
  title?: string;
  autoComplete?: 'new-password' | 'current-password';
}

/**
 * The strength meter advises and never blocks — the scorer's `blocks` is `false` by type. A
 * weak-but-legal password is this buyer's choice; our job is to make the cost visible, not to
 * overrule it from the client, which a server-side policy can do properly later.
 *
 * A local labelled input rather than design-system TextField because TextField is type="text":
 * a password field that renders its value visibly is not a password field.
 * CONTRACT-GAP: `@nastech/forms` (concurrent, empty today) will own this input.
 */
export function PasswordStep({
  onNext,
  onSkip,
  context,
  title = 'Password — optional',
  autoComplete = 'new-password',
}: PasswordStepProps) {
  const [pw, setPw] = useState('');
  const [reveal, setReveal] = useState(false);
  const strength = useMemo(() => scorePassword(pw, context ?? {}), [pw, context]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    // Only the empty password can't proceed; any non-empty value is allowed, at any score.
    if (pw === '') return;
    onNext(pw);
  }

  const inputId = 'auth-password';
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: S.page.gap }} data-testid="password-step">
      <h2 style={S.h1}>{title}</h2>
      <p style={S.p}>
        Set a password if you want to sign in on shared or borrowed phones without your SIM. You can
        always sign in with a texted code instead.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1 }}>
        <label htmlFor={inputId} style={{ color: tokens.text.primary, fontFamily: raw.type.familyText, fontSize: '0.875rem', fontWeight: 600 }}>
          Password
        </label>
        <div style={{ display: 'flex', gap: raw.space.s2, alignItems: 'stretch' }}>
          <input
            id={inputId}
            name={inputId}
            type={reveal ? 'text' : 'password'}
            autoComplete={autoComplete}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            data-testid="password-input"
            style={{
              flex: 1,
              border: `1px solid ${raw.color.ink300}`,
              borderRadius: raw.radius.sm,
              padding: `${raw.space.s2} ${raw.space.s3}`,
              fontFamily: raw.type.familyText,
              fontSize: '1rem',
              color: tokens.text.primary,
              background: tokens.surface.primary,
            }}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            style={{ ...S.linkish, minWidth: '4.5rem' }}
            data-testid="password-reveal"
            aria-pressed={reveal}
          >
            {reveal ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {pw !== '' ? (
        <div data-testid="strength-meter" style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1 }}>
          <div style={{ display: 'flex', gap: raw.space.s1 }} aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                style={{
                  height: '4px',
                  flex: 1,
                  borderRadius: raw.radius.sm,
                  background: i <= strength.score ? strengthColor(strength.score) : raw.color.ink100,
                }}
              />
            ))}
          </div>
          <p style={{ ...S.p, fontSize: '0.8125rem' }}>
            Strength: <strong data-testid="strength-label">{strength.label}</strong> — advice only, you can
            continue.
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', color: tokens.text.secondary, fontSize: '0.8125rem' }}>
            {strength.advice.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <button type="submit" disabled={pw === ''} style={buttonStyle(pw !== '')} data-testid="password-continue">
        Use this password
      </button>
      <button type="button" onClick={onSkip} style={S.linkish} data-testid="password-skip">
        Skip — I will use texted codes
      </button>
    </form>
  );
}

function strengthColor(score: number): string {
  if (score <= 1) return raw.color.signalCaution;
  if (score === 2) return raw.color.ink300;
  return raw.color.signalPositive;
}
