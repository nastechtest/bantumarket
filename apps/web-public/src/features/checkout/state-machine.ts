/**
 * The checkout state machine — the real ladder from `nastech-market-php/src/Orders/Order.php`,
 * consumed through `@nastech/api-client`'s mirrored `ORDER_TRANSITIONS` rather than re-declared
 * here. Two facts this file exists to keep un-ignorable in the UI:
 *
 *   1. the only event that reaches `PAID` is `PAYMENT_RECORDED` — a provider webhook
 *      (`Payments/RecordProviderPayment.php`). No button on this screen can mark an order paid;
 *   2. a refund is money-bearing only at `REFUND_SETTLED`. `REFUND_INITIATED` opens an obligation
 *      and writes nothing to the ledger (`Settlements/InitiateRefund.php` is explicit about why);
 *      a UI that renders the pending state as "moved" is lying to a seller.
 *
 * The UI phases below are *presentation* phases. They are always derived from the server's
 * `OrderStatus` plus the session's position in the flow — never the other way around: if the
 * browser dies mid-payment, the next visit asks the transport what is true.
 */

import {
  MONEY_BEARING_ORDER_EVENTS,
  ORDER_TRANSITIONS,
  canApplyOrderEvent,
  isTerminalOrderStatus,
  nextOrderStatus,
} from '@nastech/api-client';
import type { OrderEvent, OrderStatus } from '@nastech/api-client';
import type { PaymentIntentResult, PaymentIntentState } from './api/checkout-transport.js';

export type CheckoutPhase =
  | 'idle'
  | 'loading'
  | 'review'
  | 'method'
  | 'confirm'
  | 'paying'
  | 'resolving'
  | 'outcome'
  | 'unavailable'
  | 'error';

/** Statuses from which a payment intent may legally be presented at all. */
export const CHECKOUT_OPEN_STATUSES: readonly OrderStatus[] = ['AWAITING_PAYMENT'];

export function isOpenForPayment(status: OrderStatus): boolean {
  return CHECKOUT_OPEN_STATUSES.includes(status);
}

/**
 * Post-capture statuses: the ledger has booked the capture (`Order::hasReachedPaid`). Reaching any
 * of these means the buyer must NOT be offered another payment — and equally means a lost client
 * response was not a lost payment.
 */
export function paymentIsSettled(status: OrderStatus): boolean {
  return (
    status === 'PAID' ||
    status === 'HANDOVER_SCHEDULED' ||
    status === 'HANDOVER_CONFIRMED' ||
    status === 'COMPLETED'
  );
}

export function refundHasMovedMoney(event: OrderEvent): boolean {
  // Same list `Order::isMoneyBearing` keeps; `REFUND_INITIATED` is absent by design.
  return event === 'REFUND_SETTLED';
}

/**
 * The one function the processing screen keys off. Server truth (status) beats every local
 * memory: an intent whose response never arrived can still have become `PAID` underneath us.
 */
export function resolvePhase(status: OrderStatus, lastIntent: PaymentIntentResult | null): CheckoutPhase {
  if (status === 'AWAITING_PAYMENT') {
    if (lastIntent === null) return 'review';
    switch (lastIntent.state) {
      case 'failed':
        return 'outcome';
      case 'no_charge_required':
        return 'outcome';
      case 'requires_redirect':
      case 'awaiting_provider':
      case 'captured':
        // `captured` at the intent with the order still AWAITING_PAYMENT is the webhook-in-flight
        // window (RecordProviderPayment claims the event, then books). Resolve, never guess.
        return 'resolving';
    }
    return 'resolving';
  }
  if (paymentIsSettled(status) || isTerminalOrderStatus(status) || status === 'IN_DISPUTE') {
    return 'outcome';
  }
  return 'outcome';
}

export interface StatusCopy {
  readonly title: string;
  readonly body: string;
  /** Whether the copy may state that money moved. Only REFUNDED/COMPLETED-side facts may. */
  readonly moneyMoved: boolean;
}

export const STATUS_COPY: Readonly<Record<OrderStatus, StatusCopy>> = {
  AWAITING_PAYMENT: {
    title: 'Awaiting payment',
    body: 'Nothing has been paid yet. The order is held for you while you complete this checkout.',
    moneyMoved: false,
  },
  PAID: {
    title: 'Paid',
    // The provider's webhook booked this, not a button here — the copy says where the money is.
    body: 'Your payment is confirmed and the ledger has booked it. Next step is the handover.',
    moneyMoved: true,
  },
  HANDOVER_SCHEDULED: {
    title: 'Paid — handover scheduled',
    body: 'Your payment is confirmed. A handover PIN has been issued for the meet-up.',
    moneyMoved: true,
  },
  HANDOVER_CONFIRMED: {
    title: 'Handover confirmed',
    body: 'Both sides confirmed the handover. The order completes when the seller payout window closes.',
    moneyMoved: true,
  },
  COMPLETED: {
    title: 'Completed',
    body: 'The sale is complete. Commission on this sale was charged to the seller and will be reversed in full if the order is refunded.',
    moneyMoved: true,
  },
  CANCELLED: {
    title: 'Cancelled',
    body: 'This order was cancelled before any payment was captured. Nothing was charged.',
    moneyMoved: false,
  },
  REFUND_PENDING: {
    title: 'Refund initiated — money has not moved yet',
    // InitiateRefund writes NO ledger rows; rendering this as "refunded" is the lie this guards.
    body: 'A refund has been requested. The money moves only when the provider settles it; until then this order shows as not yet refunded.',
    moneyMoved: false,
  },
  REFUNDED: {
    title: 'Refunded',
    // SettleRefund releases the hold, debits earnings and reverses the commission in one transaction.
    body: 'The refund has settled: the buyer is paid back, the seller hold is released, and the commission on this sale was reversed in full.',
    moneyMoved: true,
  },
  IN_DISPUTE: {
    title: 'In dispute',
    body: 'This order is under dispute review. Payment state is frozen while a resolver reads the disclosures.',
    moneyMoved: false,
  },
};

/**
 * The outcome screen's copy for the buyer's own payment question: "did I pay?". Derived only
 * from `OrderStatus` + `PaymentIntentState` — never from whether our POST got a response.
 */
export function moneyQuestionCopy(status: OrderStatus, lastIntent: PaymentIntentResult | null): string {
  if (paymentIsSettled(status)) return 'You paid. The capture was booked by the payment provider’s confirmation.';
  if (status === 'REFUND_PENDING') return 'You paid, and a refund was requested. It has NOT been returned to you yet — only the settled refund moves money.';
  if (status === 'REFUNDED') return 'You paid, and the refund has settled — the money is on its way back through the provider.';
  if (status === 'AWAITING_PAYMENT' && lastIntent?.state === 'failed') {
    return lastIntent.failureReason === 'card_declined'
      ? 'Your card was declined by the bank. Nothing was charged to you.'
      : 'The payment did not go through. Nothing was charged.';
  }
  if (status === 'AWAITING_PAYMENT' && lastIntent !== null && lastIntent.state !== 'no_charge_required') {
    return 'Your payment is with the provider. We will show it as paid only when their confirmation reaches the ledger — not before.';
  }
  if (status === 'AWAITING_PAYMENT' && lastIntent?.state === 'no_charge_required') {
    return 'No payment has been taken. You pay the seller in cash at the handover.';
  }
  return STATUS_COPY[status].body;
}

/** Re-exports so feature code imports the ladder from ONE module and can’t drift from it. */
export {
  ORDER_TRANSITIONS,
  MONEY_BEARING_ORDER_EVENTS,
  canApplyOrderEvent,
  isTerminalOrderStatus,
  nextOrderStatus,
};
export type { OrderEvent, OrderStatus, PaymentIntentState };
