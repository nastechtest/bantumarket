import { MoneyText } from '@nastech/design-system';
import type { DashboardOrder } from './api/dashboard-transport.js';
import { SELLER_ORDER_LABELS, SELLER_ORDER_TONES } from './order-labels.js';
import { Chip, Muted, Panel } from './ui.js';

export function SalesSummary({
  orders,
  waitingOnYou,
}: {
  orders: readonly DashboardOrder[];
  waitingOnYou: number;
}) {
  return (
    <Panel title="Sales" subtitle={waitingOnYou > 0 ? `${waitingOnYou} waiting on you` : 'Nothing waiting on you'} actions={<a href="/orders">All sales</a>} id="sales-summary">
      {orders.length === 0 ? (
        <Muted>No sales yet. When a buyer pays, the order appears here and the money is held by NasTech.</Muted>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {orders.map((order) => (
            <li key={order.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
              <div>
                <a href={`/orders/${order.id}`} style={{ fontWeight: 600, color: 'inherit' }}>
                  {order.listingTitle}
                </a>
                <div style={{ marginTop: '2px' }}>
                  <Chip tone={SELLER_ORDER_TONES[order.state]}>{SELLER_ORDER_LABELS[order.state]}</Chip>
                </div>
              </div>
              <MoneyText value={order.amount} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
