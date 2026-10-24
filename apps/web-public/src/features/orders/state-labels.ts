import type { OrderStatus, OrderEvent } from '@nastech/api-client';
import { ORDER_TRANSITIONS, canApplyOrderEvent, MONEY_BEARING_ORDER_EVENTS } from '@nastech/api-client';

/**
 * The order vocabulary the whole feature speaks. The names come from the PHP ledger
 * (`nastech-market-php/src/Orders/Order.php`), mirrored into `@nastech/api-client`; nothing in
 * `apps/web-public` may invent a state or soften one. The ladder is:
 *
 *   AWAITING_PAYMENT → PAID → HANDOVER_SCHEDULED → HANDOVER_CONFIRMED → COMPLETED
 * plus CANCELLED, REFUND_PENDING → REFUNDED, and IN_DISPUTE as side states.
 *
 * A refund is money-bearing only when it SETTLES. `REFUND_INITIATED` is an event, not a state —
 * the state a viewer ever sees is `REFUND_PENDING`, and its label must never read as "the money
 * moved" (`Order::isMoneyBearing` in the ledger is the authority).
 */
export type OrderState = OrderStatus;
export type OrderEventName = OrderEvent;

/** The exact ladder, as the verified truth (wave-b addendum). Kept here so the map below is
 *  total over it by construction: `Record<OrderState, …>` cannot compile if a state lacks a label. */
export const ORDER_STATES: readonly OrderState[] = Object.keys(ORDER_TRANSITIONS) as OrderState[];

export type MoneyPosition = 'none' | 'held' | 'released' | 'returned' | 'contested' | 'unknown';

export interface StateLabel {
  /** What the buyer's screen chips say. Plain words, no ledger jargon. */
  readonly buyer: string;
  /** What the seller's screen chips say. */
  readonly seller: string;
  /** One honest sentence about where the money is. Rendered next to the chip. */
  readonly moneyNote: string;
  /** Position of money, machine-readable, for tests and for tone selection. */
  readonly moneyPosition: MoneyPosition;
  /** Whether the position is decided by the state alone (false for CANCELLED — depends on paidAt). */
  readonly moneyDecided: boolean;
  readonly tone: 'neutral' | 'progress' | 'success' | 'caution' | 'problem';
}

export const STATE_LABELS: Readonly<Record<OrderState, StateLabel>> = {
  AWAITING_PAYMENT: {
    buyer: 'Waiting for your payment',
    seller: 'Waiting for the buyer to pay',
    moneyNote: 'Nothing has been paid yet. The order is only yours once payment is confirmed by the provider.',
    moneyPosition: 'none',
    moneyDecided: true,
    tone: 'neutral',
  },
  PAID: {
    buyer: 'Paid — money held safely',
    seller: 'Buyer has paid — money held by NasTech',
    moneyNote: 'The buyer paid and the money is held by NasTech. It is not with the seller yet.',
    moneyPosition: 'held',
    moneyDecided: true,
    tone: 'progress',
  },
  HANDOVER_SCHEDULED: {
    buyer: 'Meet-up arranged',
    seller: 'Meet-up arranged',
    moneyNote: 'The money stays held until both of you confirm the exchange in person.',
    moneyPosition: 'held',
    moneyDecided: true,
    tone: 'progress',
  },
  HANDOVER_CONFIRMED: {
    buyer: 'Both sides confirmed the exchange',
    seller: 'Exchange confirmed — waiting on final completion',
    moneyNote: 'You both confirmed in person. The hold is released to the seller when the order completes.',
    moneyPosition: 'held',
    moneyDecided: true,
    tone: 'progress',
  },
  COMPLETED: {
    buyer: 'Done — the seller was paid',
    seller: 'Completed — your payout is on its way',
    moneyNote: 'The exchange is closed and the money has moved. This order is final.',
    moneyPosition: 'released',
    moneyDecided: true,
    tone: 'success',
  },
  CANCELLED: {
    buyer: 'Cancelled',
    seller: 'Cancelled',
    // CANCELLED is reachable from AWAITING_PAYMENT *and* PAID (see ORDER_TRANSITIONS), so the
    // state alone does not say where the money is. Never claim a return we cannot prove.
    moneyNote: 'This order was cancelled. Whether money moved depends on whether payment had been recorded.',
    moneyPosition: 'unknown',
    moneyDecided: false,
    tone: 'neutral',
  },
  REFUND_PENDING: {
    buyer: 'Refund requested — money not yet returned',
    seller: 'Refund requested — not yet settled',
    // Deliberately awkward to a marketer's eye: a settled-sounding word here would be the lie
    // the wave-b rules forbid. The request is not the movement.
    moneyNote: 'A refund has been requested. Until it settles, the money is still held — nothing has been returned yet.',
    moneyPosition: 'held',
    moneyDecided: true,
    tone: 'caution',
  },
  REFUNDED: {
    buyer: 'Refunded — the money was returned',
    seller: 'Refunded',
    moneyNote: 'The refund settled and the money has been returned.',
    moneyPosition: 'returned',
    moneyDecided: true,
    tone: 'success',
  },
  IN_DISPUTE: {
    buyer: 'Under review',
    seller: 'Dispute open',
    moneyNote: 'The money stays held while the review is open. Neither side can spend it.',
    moneyPosition: 'contested',
    moneyDecided: true,
    tone: 'problem',
  },
};

/** The five rungs the status track draws. Side states (cancel/refund/dispute) are chips, not rungs. */
export const LADDER_STAGES: readonly { state: OrderState; label: string }[] = [
  { state: 'AWAITING_PAYMENT', label: 'Order placed' },
  { state: 'PAID', label: 'Paid' },
  { state: 'HANDOVER_SCHEDULED', label: 'Meet-up' },
  { state: 'HANDOVER_CONFIRMED', label: 'Confirmed' },
  { state: 'COMPLETED', label: 'Completed' },
];

export interface LadderView {
  /** Index of the last rung reached; -1 when the order sits outside the ladder. */
  readonly rung: number;
  readonly side: 'cancelled' | 'refund' | 'dispute' | null;
}

/** Pure mapping from state to track position — the render layer must not do ladder arithmetic. */
export function ladderView(state: OrderState): LadderView {
  const rung = LADDER_STAGES.findIndex((s) => s.state === state);
  if (rung >= 0) return { rung, side: null };
  if (state === 'CANCELLED') return { rung: -1, side: 'cancelled' };
  if (state === 'REFUND_PENDING' || state === 'REFUNDED') return { rung: -1, side: 'refund' };
  return { rung: -1, side: 'dispute' };
}

/**
 * Permitted UI actions per state, read off the ledger's transition table — the feature may not
 * offer a button the machine would reject with an IllegalTransition.
 */
export type OrderAction = 'cancel' | 'schedule_handover' | 'raise_dispute';

export function canAct(state: OrderState, action: OrderAction): boolean {
  const event: OrderEventName =
    action === 'cancel' ? 'CANCELLED' : action === 'schedule_handover' ? 'HANDOVER_SCHEDULED' : 'DISPUTE_OPENED';
  return canApplyOrderEvent(state, event);
}

export function isMoneyBearingEvent(event: OrderEventName): boolean {
  return MONEY_BEARING_ORDER_EVENTS.includes(event);
}

/** Where the money is for display copy, with the one state whose note depends on history. */
export function moneyPosition(order: { status: OrderState; paidAt: string | null }): MoneyPosition {
  const label = STATE_LABELS[order.status];
  if (label.moneyDecided) return label.moneyPosition;
  return order.paidAt === null ? 'none' : 'held';
}
