import { MoneyText } from '@nastech/design-system';
import type { CSSProperties } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { STATE_LABELS, moneyPosition } from './state-labels.js';
import type { OrderRow } from './api/orders-transport.js';
import { formatSast, parseServerInstant } from '../../lib/window-validity.js';

/**
 * The receipt of a closed order. Only shown where the money position is decided: a REFUND_PENDING
 * order does NOT have a receipt — it has a request — and pretending otherwise sends a buyer to
 * their bank statement to discover the difference.
 */

function moment(instant: string | null): string {
  return instant === null ? '—' : formatSast(parseServerInstant(instant)).label;
}

export function Receipt({ order }: { order: OrderRow }) {
  const position = moneyPosition(order);
  const closed = order.status === 'COMPLETED' || order.status === 'REFUNDED';
  return (
    <section
      data-testid="receipt"
      aria-label="Order receipt"
      style={{
        display: 'grid',
        gap: raw.space.s2,
        padding: raw.space.s4,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.md,
        background: tokens.surface.raised,
        fontFamily: raw.type.familyText,
      }}
    >
      <h2 style={{ margin: 0, fontSize: '1.0625rem', color: tokens.text.primary }}>
        {order.status === 'REFUNDED' ? 'Refund receipt' : 'Purchase receipt'}
      </h2>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: `${raw.space.s1} ${raw.space.s4}`, margin: 0, fontSize: '0.875rem' }}>
        <dt style={dt}>Item</dt>
        <dd style={dd}>{order.listingTitle}</dd>
        <dt style={dt}>Order</dt>
        <dd style={dd}>{order.id}</dd>
        <dt style={dt}>Placed</dt>
        <dd style={dd}>{moment(order.createdAt)}</dd>
        <dt style={dt}>Paid</dt>
        <dd style={dd}>{moment(order.paidAt)}</dd>
        <dt style={dt}>Exchange confirmed</dt>
        <dd style={dd}>{moment(order.handoverConfirmedAt)}</dd>
        {order.status === 'COMPLETED' ? (
          <>
            <dt style={dt}>Completed</dt>
            <dd style={dd}>{moment(order.completedAt)}</dd>
          </>
        ) : null}
        <dt style={dt}>You paid</dt>
        <dd style={dd}>
          <MoneyText value={order.buyerTotal} />
        </dd>
      </dl>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: tokens.text.secondary }}>
        Platform commission is taken from the seller's payout on completion — it was never added to what you paid.
      </p>
      <p role="status" style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: position === 'returned' ? raw.color.signalPositive : tokens.text.primary }}>
        {closed
          ? STATE_LABELS[order.status].moneyNote
          : 'This is not a receipt yet — the money position is not final.'}
      </p>
    </section>
  );
}

const dt: CSSProperties = { color: tokens.text.secondary, fontWeight: 400 };
const dd: CSSProperties = { margin: 0, color: tokens.text.primary, fontVariantNumeric: 'tabular-nums' };
