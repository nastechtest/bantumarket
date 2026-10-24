import { useState } from 'react';
import type { FormEvent } from 'react';
import { TextField } from '@nastech/design-system';
import { emailError } from './fields.js';
import { S, buttonStyle } from './styles.js';

export interface EmailStepProps {
  onNext: (email: string) => void;
  /** Email is optional in this product; skip is a first-class button, not a shrug in the corner. */
  onSkip: () => void;
  initialValue?: string;
}

export function EmailStep({ onNext, onSkip, initialValue = '' }: EmailStepProps) {
  const [email, setEmail] = useState(initialValue);
  const [error, setError] = useState<string | undefined>(undefined);

  function submit(event: FormEvent): void {
    event.preventDefault();
    const err = emailError(email);
    setError(err);
    if (err === undefined) onNext(email.trim());
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: S.page.gap }} data-testid="email-step">
      <h2 style={S.h1}>Email — optional</h2>
      <p style={S.p}>
        Your phone number is the account. An email only adds receipts in your inbox and password
        resets by email. You can add it later in your account.
      </p>
      <TextField
        id="auth-email"
        label="Email address"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(v) => {
          setEmail(v);
          setError(undefined);
        }}
        {...(error !== undefined ? { error } : {})}
      />
      <button type="submit" style={buttonStyle(true)} data-testid="email-continue">
        {email.trim() === '' ? 'Continue without email' : 'Save email'}
      </button>
      <button type="button" onClick={onSkip} style={S.linkish} data-testid="email-skip">
        Skip for now
      </button>
    </form>
  );
}
