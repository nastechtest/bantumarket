import { money } from '@nastech/api-contracts';
import type { OrderState } from '../state-labels.js';
import { canApplyOrderEvent } from '@nastech/api-client';
import type { CancelOutcome, OrderListFilters, OrderRole, OrderRow, OrdersTransport } from './orders-transport.js';

/**
 * Fixture data covering the whole ladder, so a missing state in any map is visible on screen —
 * and in `order-status.test.ts`, which fails if `STATE_LABELS` stops being total over it.
 *
 * All instants are server-derived ATOM strings at a fixed offset (+02:00, SAST). The frontend
 * must never call `Date.now()` for a money-relevant decision; the fixtures expose a clock the
 * transport reads, mirroring the PHP `Clock` the handlers inject.
 */

export const ME_BUYER = 'usr_buyer_nomsa';
export const ME_SELLER = 'usr_seller_pieter';

const row = (
  id: string,
  status: OrderState,
  priceRand: number,
  created: string,
  extra: Partial<Pick<OrderRow, 'paidAt' | 'handoverConfirmedAt' | 'completedAt' | 'handoverTokenId'>> = {},
): OrderRow => ({
  id,
  listingId: `lst_${id.slice(4).toLowerCase()}`,
  listingTitle: 'Pre-owned Seiko Presage "Cocktail Time"',
  buyerId: ME_BUYER,
  sellerId: ME_SELLER,
  category: 'watches',
  itemPrice: money(Math.round(priceRand * 100)),
  // buyerTotal is what the buyer actually paid; commission is taken from the seller on
  // completion, so for the buyer these are equal on this fixture.
  buyerTotal: money(Math.round(priceRand * 100)),
  status,
  createdAt: created,
  paidAt: extra.paidAt ?? null,
  handoverConfirmedAt: extra.handoverConfirmedAt ?? null,
  completedAt: extra.completedAt ?? null,
  handoverTokenId: extra.handoverTokenId ?? null,
});

/** One order per state on the ladder. `ord_*` ids double as route params in the demo app. */
export const FIXTURE_ORDERS: readonly OrderRow[] = [
  row('ord_01', 'AWAITING_PAYMENT', 4200, '2026-10-06T09:12:00+02:00'),
  row('ord_02', 'PAID', 4200, '2026-10-05T11:02:00+02:00', { paidAt: '2026-10-05T11:04:31+02:00' }),
  row('ord_03', 'HANDOVER_SCHEDULED', 5850, '2026-10-04T15:30:00+02:00', {
    paidAt: '2026-10-04T15:32:10+02:00',
    handoverTokenId: 'hdt_sched01',
  }),
  row('ord_04', 'HANDOVER_CONFIRMED', 3300, '2026-10-02T10:00:00+02:00', {
    paidAt: '2026-10-02T10:01:44+02:00',
    handoverConfirmedAt: '2026-10-03T13:20:05+02:00',
    handoverTokenId: 'hdt_conf01',
  }),
  row('ord_05', 'COMPLETED', 2750, '2026-09-28T08:45:00+02:00', {
    paidAt: '2026-09-28T08:46:02+02:00',
    handoverConfirmedAt: '2026-09-29T12:10:00+02:00',
    completedAt: '2026-09-29T12:40:00+02:00',
    handoverTokenId: 'hdt_done01',
  }),
  row('ord_06', 'CANCELLED', 1950, '2026-09-30T17:05:00+02:00'),
  row('ord_07', 'REFUND_PENDING', 6100, '2026-09-20T09:00:00+02:00', { paidAt: '2026-09-20T09:02:00+02:00' }),
  row('ord_08', 'REFUNDED', 2400, '2026-09-10T14:20:00+02:00', { paidAt: '2026-09-10T14:21:00+02:00' }),
  row('ord_09', 'IN_DISPUTE', 8900, '2026-09-05T12:00:00+02:00', {
    paidAt: '2026-09-05T12:01:30+02:00',
    handoverConfirmedAt: '2026-09-06T11:00:00+02:00',
  }),
  // A cancelled order that HAD been paid: `moneyPosition` must answer "held", not "none" —
  // the case the CANCELLED label alone cannot decide.
  row('ord_10', 'CANCELLED', 3000, '2026-09-27T10:00:00+02:00', { paidAt: '2026-09-27T10:03:00+02:00' }),
];

export interface FixtureTransportOptions {
  readonly orders?: readonly OrderRow[];
  /** Deterministic latency for loading-state tests; 0 keeps tests synchronous-fast. */
  readonly delayMs?: number;
  /** When set, every call rejects with this message — for the error state, not the happy path. */
  readonly failWith?: string;
  /** Injectable server clock; the fixture never reads the client's wall time. */
  readonly serverNow?: () => number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * In-memory transport over the fixtures. `cancelOrder` enforces the ledger's own rule —
 * CANCELLED is only reachable from AWAITING_PAYMENT and PAID (`Order::TRANSITIONS`) — and
 * records how many times each idempotency key was seen, so double-submit tests can count.
 */
export function createFixtureOrdersTransport(options: FixtureTransportOptions = {}): OrdersTransport & {
  /** Exposed for tests: every cancel call recorded with its key, in order. */
  readonly cancelCalls: readonly { orderId: string; idempotencyKey: string }[];
  readonly serverNowMs: () => number;
} {
  let orders: OrderRow[] = [...(options.orders ?? FIXTURE_ORDERS)];
  const cancelCalls: { orderId: string; idempotencyKey: string }[] = [];
  // key → the outcome it produced; replaying a key must not re-run the transition.
  const keyed = new Map<string, CancelOutcome>();
  const serverNow = options.serverNow ?? (() => Date.parse('2026-10-08T12:00:00+02:00'));

  async function guarded<T>(fn: () => T): Promise<T> {
    if (options.delayMs) await sleep(options.delayMs);
    if (options.failWith) throw new Error(options.failWith);
    return fn();
  }

  return {
    cancelCalls,
    serverNowMs: serverNow,
    listOrders(filters: OrderListFilters) {
      return guarded(() => {
        const mine = orders.filter((o) => (filters.role === 'buyer' ? o.buyerId === ME_BUYER : o.sellerId === ME_SELLER));
        if (filters.includeClosed === false) return mine.filter((o) => !isClosed(o.status));
        return mine;
      });
    },
    getOrder(orderId: string) {
      return guarded(() => {
        const found = orders.find((o) => o.id === orderId);
        if (!found) throw new Error(`No order ${orderId} in this fixture set.`);
        return found;
      });
    },
    cancelOrder(orderId: string, idempotencyKey: string) {
      return guarded(() => {
        const replay = keyed.get(idempotencyKey);
        if (replay !== undefined) return replay;

        const index = orders.findIndex((o) => o.id === orderId);
        if (index === -1) throw new Error(`No order ${orderId} in this fixture set.`);
        const order = orders[index]!;
        cancelCalls.push({ orderId, idempotencyKey });

        if (!canApplyOrderEvent(order.status, 'CANCELLED')) {
          const outcome: CancelOutcome = {
            order,
            cancelled: false,
            attemptedFrom: order.status,
            reason: `An order that is ${order.status.toLowerCase()} can no longer be cancelled here.`,
          };
          // A refusal is a completed decision for this key: the same key must not turn into a
          // cancel later if the user's state was stale.
          keyed.set(idempotencyKey, outcome);
          return outcome;
        }

        const next: OrderRow = { ...order, status: 'CANCELLED' };
        orders = orders.map((o, i) => (i === index ? next : o));
        const outcome: CancelOutcome = { order: next, cancelled: true, attemptedFrom: order.status };
        keyed.set(idempotencyKey, outcome);
        return outcome;
      });
    },
  };
}

const CLOSED: readonly OrderState[] = ['COMPLETED', 'CANCELLED', 'REFUNDED'];
export function isClosed(status: OrderState): boolean {
  return CLOSED.includes(status);
}

/** For tests that need one order of a given state, without knowing the fixture ids. */
export function fixtureOrderIn(status: OrderState): OrderRow {
  const found = FIXTURE_ORDERS.find((o) => o.status === status);
  if (!found) throw new Error(`fixture has no order in ${status}`);
  return found;
}

export function fixtureOrdersFor(role: OrderRole): readonly OrderRow[] {
  return FIXTURE_ORDERS.filter((o) => (role === 'buyer' ? o.buyerId === ME_BUYER : o.sellerId === ME_SELLER));
}
