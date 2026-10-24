import { useState } from 'react';
import type { FormEvent } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { S, buttonStyle } from './styles.js';
import { PolicyLinks } from './policy-links.js';

export interface ConsentInput {
  acceptedTerms: boolean;
  acceptedPrivacyNotice: boolean;
  marketingOptIn: boolean;
}

export interface ConsentStepProps {
  onSubmit: (consent: ConsentInput) => void;
  busy?: boolean;
  error?: string | undefined;
}

function Checkbox({
  id,
  label,
  checked,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: raw.space.s2, alignItems: 'flex-start' }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={id}
        style={{ width: '20px', height: '20px', marginTop: '2px', flexShrink: 0 }}
      />
      <div>
        <label htmlFor={id} style={{ color: tokens.text.primary, fontSize: '0.9375rem', fontFamily: raw.type.familyText }}>
          {label}
        </label>
        {hint ? <p style={{ ...S.p, fontSize: '0.8125rem' }}>{hint}</p> : null}
      </div>
    </div>
  );
}

/**
 * POPIA consent, collected as separate decisions rather than one "I agree to everything":
 * direct marketing is opt-in with an explicit default-off (s.43), and the privacy notice is
 * acknowledged separately from the contract. The full notice text is not pasted here — the link
 * must actually be read-able on a $100 phone, which a 40-screen wall is not.
 */
export function ConsentStep({ onSubmit, busy = false, error }: ConsentStepProps) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacyNotice, setAcceptedPrivacyNotice] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const ready = acceptedTerms && acceptedPrivacyNotice && !busy;

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!ready) return;
    onSubmit({ acceptedTerms, acceptedPrivacyNotice, marketingOptIn });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: S.page.gap }} data-testid="consent-step">
      <h2 style={S.h1}>Before we finish</h2>
      <p style={S.p}>Two things we legally need, one thing we'd like. Unchecking any of them is always possible later.</p>
      <Checkbox
        id="consent-terms"
        label="I agree to the terms of sale"
        hint="Includes: what commission is taken, and the no-shadow-banning rules between buyers and sellers."
        checked={acceptedTerms}
        onChange={setAcceptedTerms}
      />
      <Checkbox
        id="consent-privacy"
        label="I have read the privacy notice (POPIA)"
        hint="We process your number, your orders and handover locations. Sellers see your number only when an order needs coordination."
        checked={acceptedPrivacyNotice}
        onChange={setAcceptedPrivacyNotice}
      />
      <Checkbox
        id="consent-marketing"
        label="Tell me about new listings and events"
        hint="Optional. Off by default. One SMS a week at most, STOP to end it."
        checked={marketingOptIn}
        onChange={setMarketingOptIn}
      />
      {error !== undefined ? (
        <p role="alert" style={S.alert} data-testid="consent-error">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={!ready} style={buttonStyle(ready)} data-testid="consent-submit">
        {busy ? 'Creating your account…' : 'Create account'}
      </button>
      <PolicyLinks />
    </form>
  );
}
