import { raw, tokens } from '@nastech/design-tokens';
import { TextField } from '@nastech/design-system';
import type { PaymentIntentResult } from '../api/checkout-transport.js';
import { MethodStatus } from './method-status.js';

/**
 * Instant EFT: approval happens in the buyer's own banking app via the provider's push. The one
 * datum this app legitimately needs is the mobile number the push goes to — it is identity-adjacent
 * but not payment instrument data, so it is a validated local field (see validation.ts,
 * CONTRACT-GAP) and it is never interpolated into any error copy.
 */
export interface InstantEftPanelProps {
  readonly mobileValue: string;
  readonly onMobile: (next: string) => void;
  readonly mobileError?: string;
  readonly intent: PaymentIntentResult | null;
}

export function InstantEftPanel({ mobileValue, onMobile, mobileError, intent }: InstantEftPanelProps) {
  return (
    <div data-testid="method-instant-eft" style={{ display: 'grid', gap: raw.space.s3 }}>
      <div
        style={{
          background: tokens.surface.raised,
          borderRadius: raw.radius.md,
          padding: raw.space.s4,
          fontFamily: raw.type.familyText,
          color: tokens.text.primary,
        }}
      >
        <p style={{ margin: 0, fontWeight: 700 }}>Approve the payment in your banking app</p>
        <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary }}>
          Your bank handles the actual money movement — we send the request, you approve it on
          their surface. If you close this page mid-approval, come back: this screen will show what
          the ledger recorded, not what the browser remembers.
        </p>
      </div>
      <TextField
        label="Mobile number for the approval push"
        required
        inputMode="tel"
        autoComplete="tel"
        value={mobileValue}
        onChange={onMobile}
        {...(mobileError !== undefined ? { error: mobileError } : {})}
        hint="South African mobile, e.g. 082 123 4567."
      />
      <MethodStatus intent={intent} />
    </div>
  );
}
