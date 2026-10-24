import { raw, tokens } from '@nastech/design-tokens';
import { Stepper, MoneyText } from '@nastech/design-system';
import type { CheckoutView } from '../api/checkout-transport.js';
import { CHECKOUT_STEPS } from './review.js';
import { STATUS_COPY, moneyQuestionCopy } from '../state-machine.js';
import { ineligibilityCopy } from '../guards/ineligible-listing.js';

export interface DoneStepProps {
  readonly view: CheckoutView;
}

/**
 * The outcome screen — a mirror of the ledger's answer to "what happened to my money?", with the
 * refund rule made visible: `REFUND_PENDING` says the words “has not moved yet”, because
 * `InitiateRefund` writes no ledger rows and a screen that called the request a movement would be
 * lying to a seller about their own balance.
 */
export function DoneStep({ view }: DoneStepProps) {
  const status = view.order.status;
  const copy = STATUS_COPY[status];
  const moneyAnswer = moneyQuestionCopy(status, view.lastIntent);
  const ineligible = view.ineligibilityCode !== null ? ineligibilityCopy(view.ineligibilityCode) : null;
  // The amount line must not call an unpaid order "Paid": cash-on-handover and cancelled orders
  // are still AWAITING_PAYMENT/CANCELLED at the ledger, whatever this screen is showing.
  const amountLabel =
    status === 'REFUNDED'
      ? 'Refunded (settled) amount'
      : status === 'REFUND_PENDING'
        ? 'Refund amount (not yet moved)'
        : copy.moneyMoved
          ? 'Paid'
          : 'Order total — not yet paid';

  return (
    <section
      data-testid="step-done"
      data-order-status={status}
      aria-label="Order outcome"
      style={{ display: 'grid', gap: raw.space.s4 }}
    >
      <Stepper steps={CHECKOUT_STEPS} currentIndex={2} />
      <header data-testid="done-status" data-order-status={status}>
        <h2 style={{ margin: 0, fontFamily: raw.type.familyText, color: raw.color.ink900 }}>{copy.title}</h2>
        <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary, fontFamily: raw.type.familyText }}>
          {moneyAnswer}
        </p>
        <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary, fontSize: '0.875rem' }}>{copy.body}</p>
      </header>

      {ineligible !== null ? (
        <div
          data-testid="done-ineligibility"
          style={{
            border: `1px solid ${raw.color.signalNegative}`,
            borderRadius: raw.radius.md,
            padding: raw.space.s4,
            fontFamily: raw.type.familyText,
            color: raw.color.ink900,
          }}
        >
          <strong>{ineligible.title}</strong>
          <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary }}>{ineligible.body}</p>
          <p style={{ margin: `${raw.space.s1} 0 0` }}>Next step: {ineligible.nextStep}</p>
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: raw.type.familyText,
          color: raw.color.ink900,
          borderTop: `2px solid ${raw.color.ink900}`,
          paddingTop: raw.space.s2,
        }}
      >
        <span>{amountLabel}</span>
        {/* Refunded rows use the accounting parenthesis form once — and only once — the refund SETTLED. */}
        <MoneyText value={view.order.buyerTotal} refunded={status === 'REFUNDED'} />
      </div>

      {view.sellerCommission !== null ? (
        <p data-testid="done-commission-note" style={{ margin: 0, color: tokens.text.disabled, fontSize: '0.8125rem', fontFamily: raw.type.familyText }}>
          Commission on this sale ({view.sellerCommission.rateLabel}, {view.sellerCommission.amount.cents >= 0 ? 'charged to the seller' : 'reversed'}) is a seller-side charge.{' '}
          {view.sellerCommission.note}
        </p>
      ) : null}

      <nav aria-label="Checkout actions" style={{ display: 'flex', gap: raw.space.s3 }}>
        <a
          href={`/handover/${encodeURIComponent(view.orderId)}`}
          data-testid="done-handover-link"
          style={{ color: raw.color.ink900, fontFamily: raw.type.familyText, fontWeight: 700 }}
        >
          Arrange the handover
        </a>
        <a href={`/item/${encodeURIComponent(view.listingId)}`} style={{ color: tokens.text.secondary, fontFamily: raw.type.familyText }}>
          Back to the listing
        </a>
      </nav>
    </section>
  );
}
