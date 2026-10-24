import { useState } from 'react';
import type { CSSProperties } from 'react';
import { MoneyText } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { canAct, STATE_LABELS } from './state-labels.js';
import type { OrderRow } from './api/orders-transport.js';
import type { OrdersTransport } from './api/orders-transport.js';
import { useCancelOrder } from './use-orders.js';

/**
 * Cancelling an order, with the money truth stated before the button is pressable.
 *
 * The ledger allows CANCELLED from AWAITING_PAYMENT and PAID only (`Order::TRANSITIONS`), so
 * from any later state this component explains the correct door instead of offering the wrong
 * button. After PAID, cancelling opens a refund — it does not move money; saying "you'll be
 * refunded R X" at request time is the lie `Order::isMoneyBearing` exists to prevent.
 */

export function CancelFlow({ order, transport }: { order: OrderRow; transport: OrdersTransport }) {
  const [understood, setUnderstood] = useState(false);
  const flow = useCancelOrder(transport, order.id);

  if (!canAct(order.status, 'cancel')) {
    return (
      <section aria-label="Cancel order" data-testid="cancel-blocked">
        <p style={pStyle}>
          {STATE_LABELS[order.status].moneyNote} An order that is <strong>{order.status.replace(/_/g, ' ').toLowerCase()}</strong> can no
          longer be cancelled from here.
        </p>
        <p style={pStyle}>
          If something is wrong with the exchange,{' '}
          <a href={`/dispute/${order.id}`} style={{ color: tokens.action.default, fontWeight: 600 }}>
            open a review
          </a>{' '}
          instead — the money is held while it runs.
        </p>
      </section>
    );
  }

  const paid = order.paidAt !== null;
  const moneyLine = paid ? (
    <>
      You have paid <MoneyText value={order.buyerTotal} />. Cancelling only opens a{' '}
      <strong>refund request</strong> — your money returns when the refund <strong>settles</strong>, which is not instant and
      not this button.
    </>
  ) : (
    <>You have not paid yet, so cancelling this order moves no money and costs you nothing.</>
  );

  if (flow.done) {
    return (
      <section aria-label="Cancel order result" data-testid="cancel-result">
        <p role="status" style={pStyle}>
          {flow.outcome === 'cancelled'
            ? paid
              ? 'Order cancelled. A refund has been requested; the hold is still with NasTech until it settles — that part moves money, and it is not done yet.'
              : 'Order cancelled. Nothing was ever charged.'
            : flow.message}
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Cancel order" data-testid="cancel-flow" style={{ display: 'grid', gap: raw.space.s3 }}>
      <p style={pStyle}>{moneyLine}</p>
      <label style={{ ...pStyle, display: 'flex', gap: raw.space.s2, alignItems: 'flex-start' }}>
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        <span>
          {paid
            ? 'I understand the refund is only requested now, and settles later.'
            : 'I understand this closes the order without any payment.'}
        </span>
      </label>
      <div style={{ display: 'flex', gap: raw.space.s3 }}>
        <button type="button" style={ghostButton} onClick={() => { setUnderstood(false); flow.reset(); }}>
          Keep the order
        </button>
        <button
          type="button"
          disabled={!understood || flow.busy}
          style={dangerButton(!understood || flow.busy)}
          onClick={() => void flow.cancel()}
        >
          {flow.busy ? 'Cancelling…' : 'Yes, cancel this order'}
        </button>
      </div>
      {flow.outcome === 'failed' ? <p role="alert" style={{ ...pStyle, color: raw.color.signalNegative }}>{flow.message}</p> : null}
    </section>
  );
}

const pStyle: CSSProperties = {
  margin: 0,
  fontFamily: raw.type.familyText,
  fontSize: '0.9375rem',
  color: tokens.text.primary,
  lineHeight: 1.5,
};

const dangerButton = (disabled: boolean): CSSProperties => ({
  padding: `${raw.space.s2} ${raw.space.s4}`,
  borderRadius: raw.radius.sm,
  border: `1px solid ${raw.color.signalNegative}`,
  background: disabled ? raw.color.ink100 : raw.color.signalNegative,
  color: disabled ? tokens.text.disabled : raw.color.paper,
  fontWeight: 600,
  fontFamily: raw.type.familyText,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const ghostButton: CSSProperties = {
  padding: `${raw.space.s2} ${raw.space.s4}`,
  borderRadius: raw.radius.sm,
  border: `1px solid ${raw.color.ink300}`,
  background: tokens.surface.primary,
  color: tokens.text.primary,
  fontFamily: raw.type.familyText,
};
