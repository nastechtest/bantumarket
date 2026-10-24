import { useState } from 'react';
import { raw } from '@nastech/design-tokens';
import { ActionButton, Field, Notice } from '../../shell/ui.js';

export interface MfaStepProps {
  challengeId: string;
  onSubmit: (code: string) => Promise<void> | void;
  onResend?: () => Promise<void> | void;
  busy?: boolean;
  error?: string | null;
  onCodeChange?: (code: string) => void;
}

export const MFA_CODE_LENGTH = 6;

export function isMfaCodeValid(code: string): boolean {
  return new RegExp(`^\\d{${MFA_CODE_LENGTH}}$`).test(code);
}

/**
 * Mandatory for every staff role. There is deliberately no skip link and no "remember this
 * browser" checkbox — either would be a way for a staff session to exist without a second factor.
 */
export function MfaStep({ challengeId, onSubmit, onResend, busy = false, error = null, onCodeChange }: MfaStepProps) {
  const [code, setCode] = useState('');
  const [resendNote, setResendNote] = useState<string | null>(null);
  const valid = isMfaCodeValid(code);
  const disabledReason = !valid ? `Enter the ${MFA_CODE_LENGTH}-digit code from your authenticator.` : undefined;

  return (
    <section aria-labelledby="mfa-title" style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s3, maxWidth: '26rem' }}>
      <h2 id="mfa-title" style={{ fontFamily: raw.type.familyDisplay, fontSize: '1.25rem', margin: 0 }}>Second factor</h2>
      <p style={{ margin: 0, fontSize: '0.875rem' }}>
        Every staff session needs the code from your authenticator. Challenge <code>{challengeId}</code>.
      </p>
      <Field
        id="mfa-code"
        label={`${MFA_CODE_LENGTH}-digit code`}
        value={code}
        type="text"
        autoComplete="one-time-code"
        onChange={(next) => {
          const digits = next.replace(/\D/g, '').slice(0, MFA_CODE_LENGTH);
          setCode(digits);
          onCodeChange?.(digits);
        }}
        hint="Digits only. The code expires with this challenge."
      />
      {error ? <Notice tone="negative" title="That code was not accepted">{error}</Notice> : null}
      {resendNote ? <Notice tone="info">{resendNote}</Notice> : null}
      <ActionButton
        label="Continue"
        onClick={() => {
          void onSubmit(code);
        }}
        disabled={!valid}
        disabledReason={disabledReason}
        busy={busy}
      />
      {onResend ? (
        <ActionButton
          label="Send a new code"
          tone="secondary"
          onClick={() => {
            void Promise.resolve(onResend()).then(() => setResendNote('A new challenge was requested. The previous code no longer works.'));
          }}
        />
      ) : null}
      <p style={{ margin: 0, fontSize: '0.75rem', color: raw.color.ink500 }}>
        A sign-in response without a completed second factor is refused by this console, not warned about.
      </p>
    </section>
  );
}
