import { money } from '@nastech/api-contracts';
import type { Money } from '@nastech/api-contracts';
import type { OrderEvent, OrderStatus, OrderView } from '@nastech/api-client';
import { MONEY_BEARING_ORDER_EVENTS, ORDER_TRANSITIONS } from '@nastech/api-client';

/**
 * The order ladder, exactly as the PHP ledger has it.
 *
 * These are the nine states from `nastech-market-php/src/Orders/Order.php`, transcribed by
 * `packages/api-client/src/orders.ts` and imported from there rather than re-typed here — a fixture
 * file that re-declares the state names is a second authority on money states, and the wave-A brief
 * that invented `pending_payment → paid → handed_over` is precisely how that goes wrong.
 *
 * Two facts the corpus exists to make visible in a UI test:
 *  - `REFUND_PENDING` is a REQUEST. It moves no money. A row that renders it as "refunded" tells a
 *    seller their money left when nothing has happened; only `REFUND_SETTLED` (the event) is
 *    money-bearing, and it lands in `REFUNDED` (the state).
 *  - `IN_DISPUTE` is reachable from three states and resolvable to the SELLER only via
 *    `DISPUTE_RESOLVED_TO_SELLER → HANDOVER_CONFIRMED`. There is no Disputes module server-side yet,
 *    so a dispute UI is built against the transport interface, not an endpoint.
 *
 * The timestamps on each row are consistent with the ladder: a fixture claiming `COMPLETED` with
 * `paidAt: null` would make every "did we ever charge?" test meaningless.
 */

const HOUR = 3_600_000;

function iso(offsetHours: number): string {
  const ms = Date.parse('2026-10-06T08:00:00+02:00') + offsetHours * HOUR;
  return new Date(ms).toISOString();
}

function order(overrides: Partial<OrderView> & Pick<OrderView, 'id' | 'status'>): OrderView {
  const base: OrderView = {
    listingId: 'item-viable',
    buyerId: 'usr-buyer-1',
    sellerId: 'usr-seller-1',
    category: 'watches',
    itemPrice: money(270_000),
    buyerTotal: money(297_000),
    version: 1,
    createdAt: iso(0),
    paidAt: null,
    handoverConfirmedAt: null,
    completedAt: null,
    handoverTokenId: null,
    ...overrides,
  };
  return base;
}

/** The happy path in ladder order — an order per state, each with the timestamps its history implies. */
export const ORDER_LADDER: readonly OrderView[] = [
  order({ id: 'ord-01-awaiting', status: 'AWAITING_PAYMENT', version: 1 }),
  order({
    id: 'ord-02-paid',
    status: 'PAID',
    version: 2,
    paidAt: iso(1),
  }),
  order({
    id: 'ord-03-scheduled',
    status: 'HANDOVER_SCHEDULED',
    version: 3,
    paidAt: iso(1),
    handoverTokenId: 'tok-03',
  }),
  order({
    id: 'ord-04-confirmed',
    status: 'HANDOVER_CONFIRMED',
    version: 4,
    paidAt: iso(1),
    handoverConfirmedAt: iso(26),
    handoverTokenId: 'tok-04',
  }),
  order({
    id: 'ord-05-completed',
    status: 'COMPLETED',
    version: 5,
    paidAt: iso(1),
    handoverConfirmedAt: iso(26),
    completedAt: iso(30),
    handoverTokenId: 'tok-05',
  }),
];

/** The side states, each reached the way the ledger reaches it. */
export const ORDER_SIDE_STATES: readonly OrderView[] = [
  order({ id: 'ord-06-cancelled', status: 'CANCELLED', version: 2 }),
  order({
    id: 'ord-07-refund-pending',
    status: 'REFUND_PENDING',
    version: 3,
    paidAt: iso(1),
  }),
  order({
    id: 'ord-08-refunded',
    status: 'REFUNDED',
    version: 4,
    paidAt: iso(1),
  }),
  order({
    id: 'ord-09-dispute',
    status: 'IN_DISPUTE',
    version: 4,
    paidAt: iso(1),
    handoverConfirmedAt: iso(26),
    handoverTokenId: 'tok-09',
  }),
  // Dispute opened before handover, because that is the common one in practice: buyer says
  // "not as described" while the item has not even been passed over.
  order({ id: 'ord-10-dispute-early', status: 'IN_DISPUTE', version: 3, paidAt: iso(1) }),
];

export const ORDERS: readonly OrderView[] = [...ORDER_LADDER, ...ORDER_SIDE_STATES];

export const ORDER_BY_STATUS: Readonly<Partial<Record<OrderStatus, OrderView>>> = Object.fromEntries(
  ORDERS.map((record) => [record.status, record]),
);

/** Every state the ladder can be in, with a representative order. Completeness is asserted in tests. */
export function ordersCoveringEveryState(): Record<OrderStatus, OrderView> {
  const statuses = Object.keys(ORDER_TRANSITIONS) as OrderStatus[];
  return statuses.reduce<Record<OrderStatus, OrderView>>((acc, status) => {
    const found = ORDERS.find((candidate) => candidate.status === status);
    if (found === undefined) throw new Error(`testing/fixtures/orders: no fixture for state "${status}"`);
    acc[status] = found;
    return acc;
  }, {} as Record<OrderStatus, OrderView>);
}

/**
 * An order at a chosen state, produced by WALKING the transition table rather than by naming the
 * state. This is the fixture generator a state-machine test needs: asking for `REFUNDED` yields the
 * event path the ledger actually took, and an impossible request throws instead of fabricating a row.
 */
export function orderAtPath(status: OrderStatus, overrides: { readonly id?: string; readonly itemPrice?: Money } = {}): OrderView {
  const path: OrderEvent[] = [];
  const target = overrides.id ?? `ord-path-${status.toLowerCase()}`;
  let current: OrderStatus = 'AWAITING_PAYMENT';
  const visited = new Set<OrderStatus>([current]);

  while (current !== status) {
    const edges: Readonly<Partial<Record<OrderEvent, OrderStatus>>> = ORDER_TRANSITIONS[current];
    const next = (Object.entries(edges) as [OrderEvent, OrderStatus][]).find(([, to]) => !visited.has(to));
    if (next === undefined) {
      throw new Error(`testing/fixtures/orders: no forward path from "${current}" to "${status}"`);
    }
    visited.add(next[1]);
    path.push(next[0]);
    current = next[1];
    if (path.length > 12) throw new Error(`testing/fixtures/orders: path search did not converge toward "${status}"`);
  }

  let paidAt: string | null = null;
  let handoverConfirmedAt: string | null = null;
  let completedAt: string | null = null;
  let handoverTokenId: string | null = null;
  path.forEach((event, index) => {
    const at = iso(index + 1);
    if (event === 'PAYMENT_RECORDED') paidAt = at;
    if (event === 'HANDOVER_SCHEDULED') handoverTokenId = `tok-${target}`;
    if (event === 'HANDOVER_CONFIRMED') handoverConfirmedAt = at;
    if (event === 'ORDER_COMPLETED') completedAt = at;
  });

  return {
    id: target,
    listingId: 'item-viable',
    buyerId: 'usr-buyer-1',
    sellerId: 'usr-seller-1',
    category: 'watches',
    itemPrice: overrides.itemPrice ?? money(270_000),
    buyerTotal: overrides.itemPrice === undefined ? money(297_000) : money(Math.round(overrides.itemPrice.cents * 1.1)),
    status,
    version: path.length + 1,
    createdAt: iso(0),
    paidAt,
    handoverConfirmedAt,
    completedAt,
    handoverTokenId,
    ...(paidAt === null ? {} : {}),
  };
}

/** The event list a row was built from — exposed so a test can print it when an assertion fails. */
export function eventsOfLadder(): readonly OrderEvent[] {
  return ['PAYMENT_RECORDED', 'HANDOVER_SCHEDULED', 'HANDOVER_CONFIRMED', 'ORDER_COMPLETED'];
}

/**
 * The money-bearing events, taken from `api-client` and asserted there against
 * `Order::isMoneyBearing`. `REFUND_INITIATED` is NOT in this list, and a UI that renders it as moved
 * money is the bug this constant exists to catch.
 */
export const MONEY_BEARING: readonly OrderEvent[] = MONEY_BEARING_ORDER_EVENTS;
