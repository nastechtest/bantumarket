import { useState } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { Stepper, MoneyText } from '@nastech/design-system';
import type { CheckoutView, PaymentMethodId, PaymentIntentResult } from '../api/checkout-transport.js';
import { CardPanel } from '../methods/card.js';
import { InstantEftPanel } from '../methods/instant-eft.js';
import { CashPanel } from '../methods/cash-on-handover.js';
import { CHECKOUT_STEPS } from './review.js';
import type { CheckoutErrorView } from '../error-taxonomy.js';
import type { PayOutcome } from '../use-checkout.js';
import { validateFields, required, email as emailRule, saMobile, postcode as postcodeRule } from '../validation.js';
import type { FieldRule } from '../validation.js';

export interface ConfirmStepProps {
  readonly view: CheckoutView;
  readonly methodId: PaymentMethodId;
  readonly paying: boolean;
  readonly intent: PaymentIntentResult | null;
  readonly error?: CheckoutErrorView | null;
  readonly onPay: () => Promise<PayOutcome> | void;
  readonly onBack: () => void;
}

// CONTRACT-GAP: field state is local useState + validateFields from ../validation.js because
// @nastech/forms is empty this wave; swap both for its form controller at integration.
type ContactField = 'email' | 'mobile' | 'postcode';

const PAY_LABEL: Readonly<Record<PaymentMethodId, string>> = {
  CARD: 'Pay with card',
  INSTANT_EFT: 'Request approval in my banking app',
  CASH_ON_HANDOVER: 'Reserve — pay cash at handover',
};

function rulesFor(methodId: PaymentMethodId): Record<ContactField, readonly FieldRule[]> {
  // Empty arrays for irrelevant fields: validateFields reports nothing for them. Email is
  // optional (shape-only when present); mobile is required because a bad number fails the push;
  // postcode is optional sorting data, never money data.
  return {
    email: methodId === 'CARD' ? [emailRule()] : [],
    mobile: methodId === 'INSTANT_EFT' ? [required('Mobile number'), saMobile()] : [],
    postcode: methodId === 'CASH_ON_HANDOVER' ? [postcodeRule()] : [],
  };
}

/**
 * Step 3: the tap that starts (or re-presents) the payment intent.
 *
 * The label carries the server total for CARD/INSTANT_EFT; CASH_ON_HANDOVER deliberately has no
 * "Pay R…" affordance — the ledger books no online capture for it, so the button reserves rather
 * than pays. Double taps are absorbed twice over: the button disables once `paying`, and the
 * session's synchronous reentry lock ignores the second call even before a render lands
 * (double-charge.test.ts pins the lock, not the CSS).
 */
export function ConfirmStep({ view, methodId, paying, intent, error, onPay, onBack }: ConfirmStepProps) {
  const [values, setValues] = useState<Record<ContactField, string>>({ email: '', mobile: '', postcode: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ContactField, string>>>({});

  const setValue = (field: ContactField) => (next: string) => setValues((prev) => ({ ...prev, [field]: next }));

  function handlePay() {
    const errors = validateFields(values, rulesFor(methodId));
    setFieldErrors(errors);
    if (Object.values(errors).some((e) => e !== undefined)) return;
    void onPay();
  }

  return (
    <section data-testid="step-confirm" aria-label="Confirm payment" style={{ display: 'grid', gap: raw.space.s4 }}>
      <Stepper steps={CHECKOUT_STEPS} currentIndex={1} />
      <header>
        <h2 style={{ margin: 0, fontFamily: raw.type.familyText, color: raw.color.ink900 }}>Confirm</h2>
      </header>

      {methodId === 'CARD' ? (
        <CardPanel
          emailValue={values.email}
          onEmail={setValue('email')}
          {...(fieldErrors.email !== undefined ? { emailError: fieldErrors.email } : {})}
          intent={intent}
        />
      ) : null}
      {methodId === 'INSTANT_EFT' ? (
        <InstantEftPanel
          mobileValue={values.mobile}
          onMobile={setValue('mobile')}
          {...(fieldErrors.mobile !== undefined ? { mobileError: fieldErrors.mobile } : {})}
          intent={intent}
        />
      ) : null}
      {methodId === 'CASH_ON_HANDOVER' ? (
        <CashPanel
          postcodeValue={values.postcode}
          onPostcode={setValue('postcode')}
          {...(fieldErrors.postcode !== undefined ? { postcodeError: fieldErrors.postcode } : {})}
          intent={intent}
        />
      ) : null}

      <div
        data-testid="confirm-amount"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontFamily: raw.type.familyText,
          color: raw.color.ink900,
        }}
      >
        <strong>{methodId === 'CASH_ON_HANDOVER' ? 'Settled at handover (no online capture)' : 'Amount your bank will be asked for'}</strong>
        <MoneyText value={view.order.buyerTotal} />
      </div>

      {error !== null && error !== undefined ? (
        <div role="alert" data-testid="confirm-error" style={{ color: raw.color.signalNegative, fontFamily: raw.type.familyText }}>
          <strong>{error.title}</strong>
          <p style={{ margin: `${raw.space.s1} 0 0` }}>{error.body}</p>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: raw.space.s3 }}>
        <button
          type="button"
          data-testid="confirm-pay"
          onClick={handlePay}
          disabled={paying}
          aria-disabled={paying}
          style={{
            flex: 1,
            padding: raw.space.s4,
            borderRadius: raw.radius.md,
            border: 'none',
            background: paying ? raw.color.ink500 : raw.color.ink900,
            color: tokens.surface.primary,
            fontFamily: raw.type.familyText,
            fontWeight: 700,
            fontSize: '1rem',
            cursor: paying ? 'progress' : 'pointer',
          }}
        >
          {PAY_LABEL[methodId]}
        </button>
        <button
          type="button"
          data-testid="confirm-back"
          onClick={onBack}
          style={{
            padding: `${raw.space.s2} ${raw.space.s4}`,
            borderRadius: raw.radius.md,
            border: `1px solid ${raw.color.ink300}`,
            background: 'transparent',
            color: tokens.text.primary,
            fontFamily: raw.type.familyText,
            cursor: 'pointer',
          }}
        >
          Back
        </button>
      </div>
    </section>
  );
}
