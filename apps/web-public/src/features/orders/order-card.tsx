import { MoneyText } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { STATE_LABELS, moneyPosition } from './state-labels.js';
import type { MoneyPosition, OrderState } from './state-labels.js';
import type { OrderRole, OrderRow } from './api/orders-transport.js';

/**
 * One row in the orders list. The chip is the only place state language appears; everything
 * about money goes through `moneyPosition`, so a cancelled-after-payment order cannot be
 * rendered as "nothing moved" by accident.
 */

const toneColor: Record<string, string> = {
  neutral: raw.color.ink500,
  progress: raw.color.accent600,
  success: raw.color.signalPositive,
  caution: raw.color.signalCaution,
  problem: raw.color.signalNegative,
};

const positionText: Record<MoneyPosition, string> = {
  none: 'Nothing paid',
  held: 'Money held by NasTech',
  released: 'Seller paid',
  returned: 'Money returned to you',
  contested: 'Money held — under review',
  unknown: 'Money position unclear — see order',
};

export function OrderStatusChip({ state, role = 'buyer' }: { state: OrderState; role?: 'buyer' | 'seller' }) {
  const label = STATE_LABELS[state];
  return (
    <span
      data-testid="status-chip"
      data-state={state}
      style={{
        display: 'inline-block',
        padding: `${raw.space.s1} ${raw.space.s3}`,
        borderRadius: raw.radius.pill,
        border: `1px solid ${toneColor[label.tone] ?? raw.color.ink500}`,
        color: toneColor[label.tone] ?? raw.color.ink500,
        fontFamily: raw.type.familyText,
        fontSize: '0.8125rem',
        fontWeight: 600,
      }}
    >
      {role === 'buyer' ? label.buyer : label.seller}
    </span>
  );
}

export function OrderCard({ order, role }: { order: OrderRow; role: OrderRole }) {
  const position = moneyPosition(order);
  return (
    <article
      data-testid="order-card"
      data-order-id={order.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s2,
        padding: raw.space.s4,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.md,
        background: tokens.surface.primary,
        fontFamily: raw.type.familyText,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: raw.space.s3, alignItems: 'baseline' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: tokens.text.primary }}>{order.listingTitle}</h3>
        <OrderStatusChip state={order.status} role={role} />
      </header>
      <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.875rem' }}>
        Order {order.id} · {order.category} ·{' '}
        <MoneyText value={order.buyerTotal} refunded={order.status === 'REFUNDED'} />
      </p>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: position === 'held' || position === 'contested' ? raw.color.signalCaution : tokens.text.secondary }}>
        {positionText[position]}
      </p>
      {/*
        A plain anchor, deliberately: the router's document-level click interceptor performs the
        SPA navigation. Importing `navigate` from router.tsx here would make this critical route
        reach the scene runtime through the router's dynamic page table — the fence would (rightly)
        fail, and it is exactly why features must never value-import the router.
      */}
      <a href={`/orders/${order.id}`} style={{ color: tokens.action.default, fontSize: '0.875rem', fontWeight: 600 }}>
        View order
      </a>
    </article>
  );
}
