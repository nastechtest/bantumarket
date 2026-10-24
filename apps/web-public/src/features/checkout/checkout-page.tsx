import { useCallback, useEffect, useState } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { CheckoutApiOptions, PaymentMethodId } from './api/checkout-transport.js';
import type { CheckoutIntents } from './idempotency.js';
import type { AbandonStore } from './abandon.js';
import { useCheckout, useCheckoutState } from './use-checkout.js';
import type { PayOutcome } from './use-checkout.js';
import { ReviewStep } from './steps/review.js';
import { MethodStep } from './steps/method.js';
import { ConfirmStep } from './steps/confirm.js';
import { ProcessingStep } from './steps/processing.js';
import { DoneStep } from './steps/done.js';
import { ineligibilityCopy, deriveIneligibility } from './guards/ineligible-listing.js';

export interface CheckoutPageProps {
  readonly orderId: string;
  readonly api?: CheckoutApiOptions;
  readonly intents?: CheckoutIntents;
  readonly abandon?: AbandonStore;
  readonly pollMs?: number;
  readonly maxPolls?: number;
}

/**
 * The critical route body. No WebGL-adjacent import anywhere in this subtree (no-3d.test.ts and
 * the build fence both prove it) — a buyer on a 2G bus with no GPU gets the entire checkout, and
 * the only "animation" here is state you can read.
 */
export function CheckoutPage({ orderId, api, intents, pollMs, maxPolls }: CheckoutPageProps) {
  const session = useCheckout({
    orderId,
    ...(api !== undefined ? { api } : {}),
    ...(intents !== undefined ? { intents } : {}),
    ...(pollMs !== undefined ? { pollMs } : {}),
    ...(maxPolls !== undefined ? { maxPolls } : {}),
  });
  const state = useCheckoutState(session);
  // Keep a ref-latest mirror so click handlers fire the CURRENT session even if a re-render races
  // a tap; the reentry lock inside the session is what actually prevents double intents.
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId | null>(state.methodId);

  useEffect(() => {
    if (state.methodId !== null) setSelectedMethod(state.methodId);
  }, [state.methodId]);

  const onContinue = useCallback(() => session.goMethod(), [session]);
  const onBackToReview = useCallback(() => session.back(), [session]);
  const onSelectMethod = useCallback(
    (id: PaymentMethodId) => {
      setSelectedMethod(id);
      session.chooseMethod(id);
    },
    [session],
  );
  const onPay = useCallback((): Promise<PayOutcome> => session.pay(), [session]);
  const onRecheck = useCallback(() => {
    void session.recheck();
  }, [session]);
  const onLeave = useCallback(() => {
    session.markAbandoned();
    session.back();
  }, [session]);

  if (state.phase === 'loading' || state.phase === 'idle') {
    return (
      <div data-testid="checkout-loading" aria-busy="true" style={{ fontFamily: raw.type.familyText, color: tokens.text.secondary, padding: raw.space.s5 }}>
        Reading your order from NasTech…
      </div>
    );
  }

  if (state.phase === 'error') {
    const error = state.error;
    return (
      <section data-testid="checkout-error" style={{ display: 'grid', gap: raw.space.s3 }}>
        <h2 style={{ margin: 0, color: raw.color.ink900, fontSize: '1.125rem' }}>{error?.title ?? 'Something went wrong'}</h2>
        <p style={{ margin: 0, color: tokens.text.secondary }}>{error?.body ?? ''}</p>
        {(error?.action === 'retry_request' || error?.action === 'resolve_from_server') && (
          <button
            type="button"
            data-testid="error-retry"
            onClick={() => {
              if (error?.action === 'retry_request') void session.load(orderId);
              else void session.recheck();
            }}
            style={{
              padding: raw.space.s3,
              borderRadius: raw.radius.md,
              border: 'none',
              background: raw.color.ink900,
              color: tokens.surface.primary,
              fontFamily: raw.type.familyText,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {error?.action === 'retry_request' ? 'Try again' : 'Check the order state'}
          </button>
        )}
      </section>
    );
  }

  if (state.phase === 'unavailable') {
    // The server code is only one of the guards: a view can pass the wire field and still be
    // refused by the ledger-shape checks (total below price, fees that do not add up). Render the
    // DERIVED code, or the buyer gets the generic "something is wrong" instead of the real why.
    const derived = state.view !== null ? deriveIneligibility(state.view) : null;
    const code = derived ?? state.view?.ineligibilityCode ?? 'UNKNOWN';
    const copy = ineligibilityCopy(code);
    return (
      <section data-testid="checkout-unavailable" style={{ display: 'grid', gap: raw.space.s3 }}>
        <h2 style={{ margin: 0, color: raw.color.ink900, fontSize: '1.125rem' }}>{copy.title}</h2>
        <p style={{ margin: 0, color: tokens.text.secondary }}>{copy.body}</p>
        <p data-testid="unavailable-next-step" style={{ margin: 0, fontFamily: raw.type.familyText, color: tokens.text.primary }}>
          Next step: {copy.nextStep}
        </p>
      </section>
    );
  }

  return (
    <div data-testid="checkout-page" style={{ display: 'grid', gap: raw.space.s5, fontFamily: raw.type.familyText, color: raw.color.ink900 }}>
      <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Checkout · order {orderId}</h1>
      {state.phase === 'review' && state.view !== null ? (
        <ReviewStep view={state.view} onContinue={onContinue} {...(state.error !== null ? { error: state.error } : {})} />
      ) : null}
      {state.phase === 'method' && state.view !== null ? (
        <MethodStep view={state.view} selected={selectedMethod} onSelect={onSelectMethod} onBack={onBackToReview} />
      ) : null}
      {state.phase === 'confirm' && state.view !== null && state.methodId !== null ? (
        <ConfirmStep
          view={state.view}
          methodId={state.methodId}
          paying={false}
          intent={state.intent}
          error={state.error}
          onPay={onPay}
          onBack={onBackToReview}
        />
      ) : null}
      {state.phase === 'paying' && state.view !== null && state.methodId !== null ? (
        <ConfirmStep
          view={state.view}
          methodId={state.methodId}
          paying
          intent={state.intent}
          error={state.error}
          onPay={onPay}
          onBack={onBackToReview}
        />
      ) : null}
      {state.phase === 'resolving' ? (
        <ProcessingStep
          view={state.view}
          intent={state.intent}
          returnedFromAbandon={state.returnedFromAbandon}
          error={state.error}
          onRecheck={onRecheck}
          onBack={onLeave}
        />
      ) : null}
      {state.phase === 'outcome' && state.view !== null ? <DoneStep view={state.view} /> : null}
    </div>
  );
}
