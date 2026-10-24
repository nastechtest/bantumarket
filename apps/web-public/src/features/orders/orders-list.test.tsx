import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrdersList } from './orders-list.js';
import { OrderCard } from './order-card.js';
import { OrderStatusTrack } from './order-status-track.js';
import { CancelFlow } from './cancel-flow.js';
import { STATE_LABELS, ORDER_STATES } from './state-labels.js';
import { createFixtureOrdersTransport, fixtureOrderIn } from './api/fixtures.js';
import type { OrderState } from './state-labels.js';

/**
 * Behaviour assertions over the three list states and per-state rendering. Rendered through
 * `renderToStaticMarkup`: these components take their data as props, so a live DOM would only
 * test React, not the feature. The money-language assertions are the point of this file —
 * they are what stops a future edit from "simplifying" a label into a lie.
 */

const transport = createFixtureOrdersTransport();

describe('OrdersList states', () => {
  it('loading renders a busy marker, not a blank page', () => {
    const html = renderToStaticMarkup(<OrdersList load={{ kind: 'loading' }} role="buyer" onRetry={() => undefined} />);
    expect(html).toContain('aria-busy');
    expect(html).toContain('Loading your orders');
  });

  it('failed surfaces the transport message and a retry that fires', () => {
    let retries = 0;
    const html = renderToStaticMarkup(
      <OrdersList load={{ kind: 'failed', message: 'Orders service unreachable' }} role="buyer" onRetry={() => retries++} />,
    );
    expect(html).toContain('Orders service unreachable');
    expect(html).toContain('Try again');
    expect(html).toContain('role="alert"');
  });

  it('empty tells the buyer and the seller different useful things', () => {
    const buyer = renderToStaticMarkup(<OrdersList load={{ kind: 'ready', data: [] }} role="buyer" onRetry={() => undefined} />);
    const seller = renderToStaticMarkup(<OrdersList load={{ kind: 'ready', data: [] }} role="seller" onRetry={() => undefined} />);
    expect(buyer).toContain('No purchases yet');
    expect(seller).toContain('No sales yet');
  });

  it('renders one card per order', () => {
    const orders = [fixtureOrderIn('PAID'), fixtureOrderIn('COMPLETED'), fixtureOrderIn('IN_DISPUTE')];
    const html = renderToStaticMarkup(<OrdersList load={{ kind: 'ready', data: orders }} role="buyer" onRetry={() => undefined} />);
    expect((html.match(/data-testid="order-card"/g) ?? []).length).toBe(3);
  });
});

describe('per-state card rendering', () => {
  for (const state of ORDER_STATES) {
    it(`the ${state} card shows the ledger label, never a blank chip`, () => {
      const order = fixtureOrderIn(state);
      const html = renderToStaticMarkup(<OrderCard order={order} role="buyer" />);
      const label = STATE_LABELS[state as OrderState].buyer;
      expect(html).toContain(label);
      expect(html).toContain(order.id);
    });
  }

  it('a refund-requested order is never rendered as money moved', () => {
    const html = renderToStaticMarkup(<OrderCard order={fixtureOrderIn('REFUND_PENDING')} role="buyer" />);
    expect(html).toContain('Refund requested');
    expect(html).toContain('not yet returned');
    expect(html).not.toMatch(/>Refunded\b/);
    expect(html).not.toContain('Money returned to you');
    expect(html).toContain('Money held by NasTech');
  });

  it('cancelled-after-payment does not claim “nothing paid”', () => {
    const paid = { ...fixtureOrderIn('CANCELLED'), id: 'ord_10' };
    const withPay = { ...paid, paidAt: '2026-09-27T10:03:00+02:00' };
    const html = renderToStaticMarkup(<OrderCard order={withPay} role="buyer" />);
    expect(html).not.toContain('Nothing paid');
  });
});

describe('OrderStatusTrack', () => {
  it('marks exactly the reached rungs and current one', () => {
    const html = renderToStaticMarkup(<OrderStatusTrack state="HANDOVER_SCHEDULED" />);
    expect(html).toContain('Order placed');
    expect((html.match(/data-state="done"/g) ?? []).length).toBe(2);
    expect((html.match(/data-state="current"/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-current="step"');
  });

  it('side states come off the ladder with an explicit departure line', () => {
    const html = renderToStaticMarkup(<OrderStatusTrack state="IN_DISPUTE" />);
    expect(html).toContain('Under review');
    expect(html).toContain('hold');
    expect(html.match(/data-state="current"/g) ?? []).toHaveLength(0);
  });
});

describe('CancelFlow gates on the machine, not on taste', () => {
  it('offers no cancel button where CANCELLED is not a legal event', () => {
    for (const state of ['HANDOVER_SCHEDULED', 'HANDOVER_CONFIRMED', 'COMPLETED', 'REFUNDED'] as const) {
      const html = renderToStaticMarkup(<CancelFlow order={fixtureOrderIn(state)} transport={transport} />);
      expect(html, `${state} must not offer cancel`).toContain('data-testid="cancel-blocked"');
      expect(html).not.toContain('Yes, cancel this order');
    }
  });

  it('paid-order cancel states that the refund is requested now and settles later', () => {
    const html = renderToStaticMarkup(<CancelFlow order={fixtureOrderIn('PAID')} transport={transport} />);
    expect(html).toContain('refund request');
    expect(html).toContain('settles');
    expect(html).not.toContain('You will be refunded immediately');
    expect(html).toContain('type="checkbox"');
  });

  it('unpaid cancel states that nothing moves — and the button waits for the checkbox', () => {
    const html = renderToStaticMarkup(<CancelFlow order={fixtureOrderIn('AWAITING_PAYMENT')} transport={transport} />);
    expect(html).toContain('moves no money');
    expect(html).toContain('disabled');
  });
});
