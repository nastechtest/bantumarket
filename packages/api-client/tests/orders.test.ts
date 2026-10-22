import { describe, expect, it } from 'vitest';
import { money } from '@nastech/api-contracts';
import { ApiError } from '../src/errors.js';
import {
  ORDER_TRANSITIONS,
  TERMINAL_ORDER_STATUSES,
  canApplyOrderEvent,
  createOrdersApi,
  isTerminalOrderStatus,
  nextOrderStatus,
} from '../src/orders.js';
import { orderIntent } from '../src/idempotency.js';
import { IdempotencyKeys } from '../src/idempotency.js';
import { FakeTransport, orderViewFixture } from './fake-transport.js';

const noSleep = { sleep: async () => {} };

describe('the mirrored state machine matches Order.php, not the brief', () => {
  it('walks the happy path exactly as the ledger does', () => {
    expect(nextOrderStatus('AWAITING_PAYMENT', 'PAYMENT_RECORDED')).toBe('PAID');
    expect(nextOrderStatus('PAID', 'HANDOVER_SCHEDULED')).toBe('HANDOVER_SCHEDULED');
    expect(nextOrderStatus('HANDOVER_SCHEDULED', 'HANDOVER_CONFIRMED')).toBe('HANDOVER_CONFIRMED');
    expect(nextOrderStatus('HANDOVER_CONFIRMED', 'ORDER_COMPLETED')).toBe('COMPLETED');
  });

  it('has no client-reachable shortcut into PAID — only the webhook event gets there', () => {
    for (const from of Object.keys(ORDER_TRANSITIONS) as (keyof typeof ORDER_TRANSITIONS)[]) {
      for (const [event, to] of Object.entries(ORDER_TRANSITIONS[from])) {
        if (to === 'PAID') expect(event).toBe('PAYMENT_RECORDED');
      }
    }
    // The brief's structural fear: a handover confirming payment. It is unreachable.
    expect(canApplyOrderEvent('AWAITING_PAYMENT', 'HANDOVER_CONFIRMED')).toBe(false);
    expect(canApplyOrderEvent('AWAITING_PAYMENT', 'HANDOVER_SCHEDULED')).toBe(false);
  });

  it('models refund and dispute as the ledger does', () => {
    expect(nextOrderStatus('PAID', 'REFUND_INITIATED')).toBe('REFUND_PENDING');
    expect(nextOrderStatus('REFUND_PENDING', 'REFUND_SETTLED')).toBe('REFUNDED');
    // REFUND_INITIATED is NOT money-bearing (Order::isMoneyBearing); the request moves nothing.
    expect(nextOrderStatus('AWAITING_PAYMENT', 'REFUND_INITIATED')).toBeUndefined();
    expect(nextOrderStatus('PAID', 'DISPUTE_OPENED')).toBe('IN_DISPUTE');
    expect(nextOrderStatus('IN_DISPUTE', 'DISPUTE_RESOLVED_TO_SELLER')).toBe('HANDOVER_CONFIRMED');
    expect(nextOrderStatus('IN_DISPUTE', 'REFUND_INITIATED')).toBe('REFUND_PENDING');
  });

  it('terminal states are exactly COMPLETED, CANCELLED, REFUNDED', () => {
    expect([...TERMINAL_ORDER_STATUSES].sort()).toEqual(['CANCELLED', 'COMPLETED', 'REFUNDED']);
    expect(isTerminalOrderStatus('COMPLETED')).toBe(true);
    expect(isTerminalOrderStatus('REFUND_PENDING')).toBe(false);
  });

  it('cancellation is impossible after handover confirmation — the money is committed', () => {
    expect(canApplyOrderEvent('AWAITING_PAYMENT', 'CANCELLED')).toBe(true);
    expect(canApplyOrderEvent('PAID', 'CANCELLED')).toBe(true);
    expect(canApplyOrderEvent('HANDOVER_SCHEDULED', 'CANCELLED')).toBe(false);
    expect(canApplyOrderEvent('HANDOVER_CONFIRMED', 'CANCELLED')).toBe(false);
  });
});

describe('order mutations', () => {
  it('refuses a transition the ledger would reject BEFORE touching the transport', async () => {
    const transport = new FakeTransport();
    const orders = createOrdersApi(transport, new IdempotencyKeys());

    let rejected = false;
    try {
      await orders.cancelOrder('ord_1', orderIntent('lst_1', 1), 'COMPLETED');
    } catch (error) {
      rejected = error instanceof ApiError && error.kind === 'validation';
    }
    expect(rejected).toBe(true);
    expect(transport.calls.length).toBe(0);
  });

  it('blocks disputes on unpaid orders locally, allows them on paid ones', async () => {
    const transport = new FakeTransport();
    transport.respond(() => orderViewFixture({ status: 'IN_DISPUTE', version: 2 }));
    const orders = createOrdersApi(transport, new IdempotencyKeys(), noSleep);

    let rejected = false;
    try {
      await orders.raiseDispute('ord_1', 'not as described', orderIntent('lst_1', 1), 'AWAITING_PAYMENT');
    } catch (error) {
      rejected = error instanceof ApiError && error.kind === 'validation';
    }
    expect(rejected).toBe(true);

    const order = await orders.raiseDispute('ord_1', 'not as described', orderIntent('lst_1', 2), 'PAID');
    expect(order.status).toBe('IN_DISPUTE');
  });

  it('never retries a PIN presentation: a lost response already spent an attempt server-side', async () => {
    const transport = new FakeTransport();
    transport.alwaysFailsWith(new ApiError({ kind: 'network' }));
    const orders = createOrdersApi(transport, new IdempotencyKeys(), noSleep);

    let failed = false;
    try {
      await orders.submitHandoverPin('hdt_1', '482913');
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(transport.calls.length).toBe(1);
    // No idempotency key on the PIN call either; the counter is the protection, not the key.
    expect(transport.idempotencyKeyOf(0)).toBeUndefined();
    expect(transport.calls[0]?.body).toEqual({ pin: '482913' });
  });

  it('validates the PIN shape locally and never echoes it in the error', async () => {
    const transport = new FakeTransport();
    const orders = createOrdersApi(transport, new IdempotencyKeys());

    let message = '';
    try {
      await orders.submitHandoverPin('hdt_1', '12345');
    } catch (error) {
      message = (error as ApiError).message;
    }
    expect(message).not.toContain('12345');
    expect(transport.calls.length).toBe(0);
  });

  it('schedule from PAID passes, from AWAITING_PAYMENT is refused locally', async () => {
    const transport = new FakeTransport();
    transport.respond(() => orderViewFixture({ status: 'HANDOVER_SCHEDULED', handoverTokenId: 'hdt_9' }));
    const orders = createOrdersApi(transport, new IdempotencyKeys(), noSleep);

    const order = await orders.scheduleHandover('ord_1', orderIntent('lst_1', 1), 'PAID');
    expect(order.status).toBe('HANDOVER_SCHEDULED');

    let rejected = false;
    try {
      await orders.scheduleHandover('ord_1', orderIntent('lst_1', 2), 'AWAITING_PAYMENT');
    } catch (error) {
      rejected = error instanceof ApiError && error.kind === 'validation';
    }
    expect(rejected).toBe(true);
    // Only the legal call reached the wire.
    expect(transport.calls.length).toBe(1);
  });

  it('every orders entrypoint enforces the deadline as a timeout error', async () => {
    const transport = new FakeTransport();
    transport.alwaysHangs();
    const keys = new IdempotencyKeys();
    const orders = createOrdersApi(transport, keys, { sleep: async () => {}, timeoutMs: 5 });

    const kinds: string[] = [];
    const attempts: Array<() => Promise<unknown>> = [
      () => orders.getOrder('ord_1'),
      () => orders.createOrder({ listingId: 'lst_1', buyerTotal: money(352000), intent: orderIntent('lst_1', 't1') }),
      () => orders.scheduleHandover('ord_1', orderIntent('lst_1', 't2')),
      () => orders.submitHandoverPin('hdt_1', '482913'),
      () => orders.raiseDispute('ord_1', 'reason', orderIntent('lst_1', 't3')),
      () => orders.cancelOrder('ord_1', orderIntent('lst_1', 't4')),
    ];
    for (const attempt of attempts) {
      try {
        await attempt();
        kinds.push('resolved');
      } catch (error) {
        kinds.push(error instanceof ApiError ? error.kind : 'unclassified');
      }
    }
    expect(kinds).toEqual(['timeout', 'timeout', 'timeout', 'timeout', 'timeout', 'timeout']);
    // Timed-out mutations keep their intents: the server may have done the work under that key.
    expect(keys.pendingIntents().length).toBe(4);
  });
});
