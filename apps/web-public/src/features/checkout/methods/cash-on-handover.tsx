import { raw, tokens } from '@nastech/design-tokens';
import { TextField } from '@nastech/design-system';
import type { PaymentIntentResult } from '../api/checkout-transport.js';
import { MethodStatus } from './method-status.js';

/**
 * Cash on handover — the method with the most honest copy in the app.
 *
 * The ledger has no cash path: `PAID` is only ever reached by the provider webhook
 * (`RecordProviderPayment`), so choosing cash must NOT light up "paid" anywhere. This order stays
 * `AWAITING_PAYMENT` until both handover PINs confirm; the money moves in cash at the meet-up and
 * only the handover machine knows the difference. Saying "Pay R4,200" for this method would be
 * the UI lying about a state the ledger does not have.
 */
export interface CashPanelProps {
  readonly postcodeValue: string;
  readonly onPostcode: (next: string) => void;
  readonly postcodeError?: string;
  readonly intent: PaymentIntentResult | null;
}

export function CashPanel({ postcodeValue, onPostcode, postcodeError, intent }: CashPanelProps) {
  return (
    <div data-testid="method-cash" style={{ display: 'grid', gap: raw.space.s3 }}>
      <div
        style={{
          background: tokens.surface.raised,
          borderRadius: raw.radius.md,
          padding: raw.space.s4,
          fontFamily: raw.type.familyText,
          color: tokens.text.primary,
        }}
      >
        <p style={{ margin: 0, fontWeight: 700 }}>No online payment — you pay the seller in person</p>
        <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary }}>
          Reserving with cash keeps the order in “awaiting payment”. The seller is paid by you, at
          the handover, when both sides confirm the meet-up with their PINs. Nothing is charged
          online and no commission is booked until the sale completes — if it never completes, the
          ledger never pretends it did.
        </p>
      </div>
      <TextField
        label="Your postcode (for meet-up sorting)"
        inputMode="numeric"
        autoComplete="postal-code"
        value={postcodeValue}
        onChange={onPostcode}
        {...(postcodeError !== undefined ? { error: postcodeError } : {})}
        hint="4 digits, e.g. 2001 (Johannesburg)."
      />
      <MethodStatus intent={intent} />
    </div>
  );
}
