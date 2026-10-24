import { raw, tokens } from '@nastech/design-tokens';
import { Stepper } from '@nastech/design-system';
import type { CheckoutView, PaymentIntentResult } from '../api/checkout-transport.js';
import { CHECKOUT_STEPS } from './review.js';
import { MethodStatus } from '../methods/method-status.js';
import type { CheckoutErrorView } from '../error-taxonomy.js';
import { moneyQuestionCopy } from '../state-machine.js';

export interface ProcessingStepProps {
  readonly view: CheckoutView | null;
  readonly intent: PaymentIntentResult | null;
  readonly returnedFromAbandon: boolean;
  readonly error?: CheckoutErrorView | null;
  readonly onRecheck: () => void;
  readonly onBack: () => void;
}

/**
 * Processing is a STATE, not a spinner.
 *
 * The screen exists for one question — "did my money move?" — and the only honest answer while it
 * is unknown is: unknown, and here is who decides. Nothing on this screen says "failed" while the
 * ledger might have booked PAID, and nothing says "paid" before `PAYMENT_RECORDED` exists
 * (`RecordProviderPayment` books it from the provider webhook; no client action can). If the
 * browser dies right now, the next visit re-runs `load()`, which reads the same truth from the
 * transport — that is why the copy below never asks the buyer to "start again".
 */
export function ProcessingStep({ view, intent, returnedFromAbandon, error, onRecheck, onBack }: ProcessingStepProps) {
  const truth = view?.lastIntent ?? intent;
  return (
    <section data-testid="step-processing" aria-label="Confirming your payment" style={{ display: 'grid', gap: raw.space.s4 }}>
      <Stepper steps={CHECKOUT_STEPS} currentIndex={1} />
      <header>
        <h2 style={{ margin: 0, fontFamily: raw.type.familyText, color: raw.color.ink900 }}>Confirming with your bank</h2>
        <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary, fontSize: '0.875rem' }} data-testid="processing-truth">
          {view !== null
            ? moneyQuestionCopy(view.order.status, truth)
            : 'Reading the order state from NasTech…'}
        </p>
      </header>

      {returnedFromAbandon ? (
        <div
          data-testid="abandon-banner"
          role="status"
          style={{
            border: `1px solid ${raw.color.signalPositive}`,
            borderRadius: raw.radius.md,
            padding: raw.space.s4,
            fontFamily: raw.type.familyText,
            color: tokens.text.primary,
          }}
        >
          <strong>You came back mid-payment.</strong>
          <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary }}>
            We are showing what the ledger recorded while you were away. If your payment went
            through, it will appear here — you will not be asked to pay it twice, and we will not
            resend it on our own.
          </p>
        </div>
      ) : null}

      {error !== null && error !== undefined ? (
        <div
          role="alert"
          data-testid="processing-error"
          style={{ color: raw.color.signalNegative, fontFamily: raw.type.familyText }}
        >
          <strong>{error.title}</strong>
          <p style={{ margin: `${raw.space.s1} 0 0` }}>{error.body}</p>
        </div>
      ) : null}

      <MethodStatus intent={truth} />

      <div style={{ display: 'flex', gap: raw.space.s3 }}>
        <button
          type="button"
          data-testid="processing-recheck"
          onClick={onRecheck}
          style={{
            flex: 1,
            padding: raw.space.s4,
            borderRadius: raw.radius.md,
            border: 'none',
            background: raw.color.ink900,
            color: tokens.surface.primary,
            fontFamily: raw.type.familyText,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Check the order state again
        </button>
        <button
          type="button"
          data-testid="processing-back"
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
          Leave and come back later
        </button>
      </div>
      <p style={{ margin: 0, color: tokens.text.disabled, fontSize: '0.8125rem', fontFamily: raw.type.familyText }}>
        Leaving is safe. This screen only ever reads; the payment itself is with your bank and the
        ledger, and the true state will be re-read whenever you return.
      </p>
    </section>
  );
}
