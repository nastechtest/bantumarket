import { raw, tokens } from '@nastech/design-tokens';
import { Stepper } from '@nastech/design-system';
import type { CheckoutView } from '../api/checkout-transport.js';
import { LineItems } from '../summary/line-items.js';
import { FeeRows, CommissionRow } from '../summary/fee-rows.js';
import { TotalRow } from '../summary/total-row.js';
import { CURRENCY_LABEL } from '../summary/currency.js';
import type { CheckoutErrorView } from '../error-taxonomy.js';

export const CHECKOUT_STEPS = [{ label: 'Review' }, { label: 'Payment' }, { label: 'Done' }] as const;

export interface ReviewStepProps {
  readonly view: CheckoutView;
  readonly onContinue: () => void;
  readonly error?: CheckoutErrorView;
}

/**
 * Step 1: everything the buyer is about to pay for, exactly as the ledger states it. The
 * "Continue to payment" button changes nothing — this screen presents; the next one pays.
 */
export function ReviewStep({ view, onContinue, error }: ReviewStepProps) {
  return (
    <section data-testid="step-review" aria-label="Review your purchase" style={{ display: 'grid', gap: raw.space.s4 }}>
      <Stepper steps={CHECKOUT_STEPS} currentIndex={0} />
      <header>
        <h2 style={{ margin: 0, fontFamily: raw.type.familyText, color: raw.color.ink900 }}>Review</h2>
        <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary, fontSize: '0.875rem' }}>
          Order {view.orderId} · amounts in {CURRENCY_LABEL} · the total below is the exact amount
          the ledger will accept — a cent more or less is quarantined, not “helpfully” rounded.
        </p>
      </header>

      <LineItems items={view.items} />
      <FeeRows rows={view.feeRows} />
      <TotalRow total={view.order.buyerTotal} where="review" />
      <CommissionRow commission={view.sellerCommission} />

      {error !== undefined ? (
        <div role="alert" data-testid="review-error" style={{ color: raw.color.signalNegative, fontFamily: raw.type.familyText }}>
          <strong>{error.title}</strong>
          <p style={{ margin: `${raw.space.s1} 0 0` }}>{error.body}</p>
        </div>
      ) : null}

      <button
        type="button"
        data-testid="review-continue"
        onClick={onContinue}
        style={{
          justifySelf: 'stretch',
          padding: raw.space.s4,
          borderRadius: raw.radius.md,
          border: 'none',
          background: raw.color.ink900,
          color: tokens.surface.primary,
          fontFamily: raw.type.familyText,
          fontWeight: 700,
          fontSize: '1rem',
          cursor: 'pointer',
        }}
      >
        Continue to payment
      </button>
    </section>
  );
}
