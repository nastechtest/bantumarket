import type { OrderStatus } from '@nastech/api-client';
import { ORDER_TRANSITIONS } from '@nastech/api-client';

/**
 * Seller-side word for every rung of the ledger ladder. `Record<OrderStatus, string>` is total by
 * construction: adding a state to `@nastech/api-client` without a seller label stops compilation.
 * The wording is deliberately different from the buyer's ("Buyer has paid — money held by
 * NasTech", not "Paid"): the seller is being told about someone else's money.
 */
export const SELLER_ORDER_LABELS: Readonly<Record<OrderStatus, string>> = {
  AWAITING_PAYMENT: 'Waiting for the buyer to pay',
  PAID: 'Paid — money held by NasTech',
  HANDOVER_SCHEDULED: 'Meet-up arranged',
  HANDOVER_CONFIRMED: 'Exchange confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUND_PENDING: 'Refund requested — not settled',
  REFUNDED: 'Refunded',
  IN_DISPUTE: 'Dispute open',
};

export type SellerOrderTone = 'neutral' | 'progress' | 'success' | 'caution' | 'problem';

export const SELLER_ORDER_TONES: Readonly<Record<OrderStatus, SellerOrderTone>> = {
  AWAITING_PAYMENT: 'neutral',
  PAID: 'progress',
  HANDOVER_SCHEDULED: 'progress',
  HANDOVER_CONFIRMED: 'progress',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  REFUND_PENDING: 'caution',
  REFUNDED: 'success',
  IN_DISPUTE: 'problem',
};

/** States in which the seller has an action to take. Everything else waits on the buyer or us. */
export const SELLER_ACTION_STATES: readonly OrderStatus[] = (
  Object.keys(ORDER_TRANSITIONS) as OrderStatus[]
).filter((state) => state === 'PAID' || state === 'HANDOVER_SCHEDULED' || state === 'HANDOVER_CONFIRMED');
