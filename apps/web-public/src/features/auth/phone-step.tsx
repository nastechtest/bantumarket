import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { TextField } from '@nastech/design-system';
import { formatPhone, parsePhone } from './phone.js';
import { S, buttonStyle } from './styles.js';

export interface PhoneStepProps {
  onNext: (e164: string) => void;
  submitLabel?: string;
  title?: string;
  initialValue?: string;
}

/**
 * The number is parsed on every keystroke and the parsed result is shown back before the buyer
 * commits — "We will text a code to +27 82 123 4567" catches a mistyped digit far cheaper than
 * an OTP that never arrives does.
 */
export function PhoneStep({ onNext, submitLabel = 'Continue', title = 'Your phone number', initialValue = '' }: PhoneStepProps) {
  const [rawNumber, setRawNumber] = useState(initialValue);
  const parsed = useMemo(() => parsePhone(rawNumber), [rawNumber]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (parsed.ok && parsed.e164 !== undefined) onNext(parsed.e164);
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: S.page.gap }} data-testid="phone-step">
      <TextField
        id="auth-phone"
        label={title}
        hint="Use the number you can receive SMS on. It is your account — no email needed."
        inputMode="tel"
        autoComplete="tel"
        value={rawNumber}
        onChange={setRawNumber}
        {...(parsed.ok === false && rawNumber !== '' ? { error: parsed.error } : {})}
      />
      {parsed.ok && parsed.e164 !== undefined ? (
        <p style={S.info} data-testid="phone-preview">
          We will send a sign-in code to {formatPhone(parsed.e164)}.
          {parsed.kind === 'international'
            ? ' International numbers work, but SMS delivery depends on your carrier — it can take a minute.'
            : null}
        </p>
      ) : null}
      <button type="submit" disabled={!parsed.ok} style={buttonStyle(parsed.ok)} data-testid="phone-continue">
        {submitLabel}
      </button>
    </form>
  );
}
