import { raw, tokens } from '@nastech/design-tokens';
import { TextField } from '@nastech/design-system';
import type { PaymentIntentResult } from '../api/checkout-transport.js';
import { MethodStatus } from './method-status.js';

/**
 * Card method panel.
 *
 * What this app holds for a card payment: an optional receipt email and nothing else. There is no
 * card-number, expiry or CVV field anywhere in this feature because there is no place for one to
 * go INTO — card entry happens on the provider-hosted surface and the only datum that comes back
 * is a `providerReference` string for display (`brief: "post to a provider-hosted surface you
 * only receive a reference from"`). If you are reading this looking for where the PAN would be
 * stored: this comment is the answer, and `checkout.test.tsx` asserts the rendered card panel
 * never carries one.
 */
export interface CardPanelProps {
  readonly emailValue: string;
  readonly onEmail: (next: string) => void;
  readonly emailError?: string;
  readonly intent: PaymentIntentResult | null;
}

export function CardPanel({ emailValue, onEmail, emailError, intent }: CardPanelProps) {
  return (
    <div data-testid="method-card" style={{ display: 'grid', gap: raw.space.s3 }}>
      <div
        style={{
          background: tokens.surface.raised,
          borderRadius: raw.radius.md,
          padding: raw.space.s4,
          fontFamily: raw.type.familyText,
          color: tokens.text.primary,
        }}
      >
        <p style={{ margin: 0, fontWeight: 700 }}>Card payment happens on your bank’s secure page</p>
        <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary }}>
          When you tap Pay, NasTech asks the provider for a secure payment page. Your card details
          go to the bank, not to us: we never see them, store them, or move them through our
          servers. We only get a reference back, and the order turns to “Paid” when the provider’s
          confirmation reaches the ledger.
        </p>
      </div>
      <TextField
        label="Email for your receipt (optional)"
        inputMode="email"
        autoComplete="email"
        value={emailValue}
        onChange={onEmail}
        {...(emailError !== undefined ? { error: emailError } : {})}
        hint="Used for the receipt only; it is not sent to the payment provider."
      />
      <MethodStatus intent={intent} />
    </div>
  );
}
