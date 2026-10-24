import type { CSSProperties } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { Load } from './use-orders.js';
import type { OrderRole, OrderRow } from './api/orders-transport.js';
import { OrderCard } from './order-card.js';

/**
 * The orders list. Its job is the three non-happy states: loading (never a blank page), failed
 * (retry, with the message from the transport), and genuinely empty (what to do next, not a
 * shrug). Rendering is split from data so `orders-list.test.tsx` can pin each state.
 */

export function OrdersList({
  load,
  role,
  onRetry,
}: {
  load: Load<readonly OrderRow[]>;
  role: OrderRole;
  onRetry: () => void;
}) {
  return (
    <section
      aria-label={role === 'buyer' ? 'Your purchases' : 'Your sales'}
      data-testid="orders-list"
      style={{ display: 'grid', gap: raw.space.s4, fontFamily: raw.type.familyText }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: tokens.text.primary }}>
          {role === 'buyer' ? 'Your purchases' : 'Your sales'}
        </h1>
        <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary, fontSize: '0.875rem' }}>
          Money moves only on the ledger’s clock, never on this screen’s. Statuses below are what the ledger holds right now.
        </p>
      </header>

      {load.kind === 'loading' ? (
        <p data-testid="orders-loading" aria-busy="true" style={{ color: tokens.text.secondary }}>
          Loading your orders…
        </p>
      ) : null}

      {load.kind === 'failed' ? (
        <div data-testid="orders-error" role="alert" style={{ display: 'grid', gap: raw.space.s2 }}>
          <p style={{ color: raw.color.signalNegative }}>{load.message}</p>
          <button type="button" onClick={onRetry} style={retryButton}>
            Try again
          </button>
        </div>
      ) : null}

      {load.kind === 'ready' && load.data.length === 0 ? (
        <p data-testid="orders-empty" style={{ color: tokens.text.secondary }}>
          {role === 'buyer'
            ? 'No purchases yet. When you buy something, its payment and handover status will live here.'
            : 'No sales yet. Orders from buyers will appear here with their money held by NasTech until handover.'}
        </p>
      ) : null}

      {load.kind === 'ready' ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: raw.space.s3 }}>
          {load.data.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} role={role} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const retryButton: CSSProperties = {
  justifySelf: 'start',
  padding: `${raw.space.s2} ${raw.space.s4}`,
  borderRadius: raw.radius.sm,
  border: `1px solid ${tokens.action.default}`,
  background: 'transparent',
  color: tokens.action.default,
  fontWeight: 600,
  fontFamily: raw.type.familyText,
  cursor: 'pointer',
};
