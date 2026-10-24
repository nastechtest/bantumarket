import type { CSSProperties } from 'react';
import { MoneyText } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import type { OrderRow, OrdersTransport } from './api/orders-transport.js';
import { canAct, STATE_LABELS, moneyPosition } from './state-labels.js';
import { OrderStatusTrack } from './order-status-track.js';
import { CancelFlow } from './cancel-flow.js';
import { Receipt } from './receipt.js';

/**
 * One order, end to end: what state the ledger holds, where the money is, and exactly the
 * actions the state machine permits from here. Actions the machine would reject are not
 * rendered as buttons — they are rendered as the door that actually applies (dispute, handover,
 * reissue), because a dead button on a money screen teaches people to distrust the screen.
 */

export function OrderDetail({
  order,
  role,
  transport,
}: {
  order: OrderRow;
  role: 'buyer' | 'seller';
  transport: OrdersTransport;
}) {
  const label = STATE_LABELS[order.status];
  const position = moneyPosition(order);
  const cancellable = canAct(order.status, 'cancel');
  const handoverAvailable = order.status === 'PAID' || order.status === 'HANDOVER_SCHEDULED' || order.status === 'HANDOVER_CONFIRMED';
  const receiptable = order.status === 'COMPLETED' || order.status === 'REFUNDED';

  return (
    <section data-testid="order-detail" aria-label={`Order ${order.id}`} style={{ display: 'grid', gap: raw.space.s5 }}>
      <header style={{ display: 'grid', gap: raw.space.s2 }}>
        <h1 style={{ margin: 0, fontSize: '1.375rem', color: tokens.text.primary }}>{order.listingTitle}</h1>
        <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.875rem' }}>
          Order {order.id} · <MoneyText value={order.buyerTotal} refunded={order.status === 'REFUNDED'} /> ·{' '}
          {position === 'held' ? 'money held by NasTech' : position === 'released' ? 'settled to the seller' : position === 'returned' ? 'returned to you' : position === 'contested' ? 'held while under review' : position === 'none' ? 'nothing paid' : 'check the money line below'}
        </p>
        <OrderStatusTrack state={order.status} role={role} />
      </header>

      {order.status === 'REFUND_PENDING' ? (
        <p role="status" data-testid="refund-pending-line" style={{ ...paragraph, color: raw.color.signalCaution, fontWeight: 600 }}>
          {label.moneyNote}
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: raw.space.s4 }}>
        {handoverAvailable ? (
          <a
            data-testid="handover-link"
            href={`/handover/${order.id}`}
            style={{ ...linkStyle }}
          >
            {order.status === 'PAID'
              ? 'Arrange the handover →'
              : order.status === 'HANDOVER_SCHEDULED'
                ? 'Open the handover screen (PIN and window) →'
                : 'View the confirmed handover →'}
          </a>
        ) : null}

        {cancellable ? <CancelFlow order={order} transport={transport} /> : null}

        {receiptable ? <Receipt order={order} /> : null}

        {order.status === 'IN_DISPUTE' ? (
          <p style={paragraph}>
            A review is open. The money stays held while it runs; the outcome is recorded by the ledger, not by this screen.
          </p>
        ) : null}
      </div>
    </section>
  );
}

const paragraph: CSSProperties = {
  margin: 0,
  fontFamily: raw.type.familyText,
  fontSize: '0.9375rem',
  color: tokens.text.primary,
  lineHeight: 1.5,
};

const linkStyle: CSSProperties = {
  color: tokens.action.default,
  fontWeight: 600,
  fontFamily: raw.type.familyText,
  fontSize: '0.9375rem',
};
