/**
 * The checkout money view, in the shape the ledger publishes it.
 *
 * Every amount here is a branded `Cents`/`Money` from `@nastech/api-contracts` and every field is
 * server-issued. This module deliberately exports NO arithmetic that produces an amount: the fee a
 * buyer sees is the fee `RecordProviderPayment` booked, the total is the order's `buyerTotal`, the
 * commission is the `CommissionEntry`'s. A UI that re-derived "10% of price" would drift the day a
 * floor or cap policy lands (`CommissionPolicy::commissionOn` applies both) — so it renders the
 * rows instead.
 *
 * CRITICAL route class: nothing in this file's transitive closure may reach the scene runtime.
 */

import type { Money } from '@nastech/api-contracts';
import type { OrderView, Transport } from '@nastech/api-client';
import { execute } from '@nastech/api-client';

export type PaymentMethodId = 'CARD' | 'INSTANT_EFT' | 'CASH_ON_HANDOVER';

/**
 * States a payment intent can be in, mirroring what the payments module can actually report
 * (`Payments/RecordProviderPayment.php` + `PaymentInbox.php`): capture is a provider webhook, so
 * between "buyer acted" and "ledger booked" the truth lives server-side, never in a client flag.
 */
export type PaymentIntentState =
  | 'requires_redirect'
  | 'awaiting_provider'
  | 'captured'
  | 'failed'
  | 'no_charge_required';

/** A fee line as the server issued it. `includedInBuyerTotal` is server-asserted, never inferred. */
export interface FeeRow {
  readonly id: string;
  readonly label: string;
  readonly amount: Money;
  readonly borneBy: 'buyer' | 'seller';
  readonly includedInBuyerTotal: boolean;
}

export interface CheckoutLineItem {
  readonly listingId: string;
  readonly title: string;
  readonly unitPrice: Money;
  readonly quantity: number;
}

/**
 * The seller-side commission, shown to the buyer as fact ("taken from the seller on completion,
 * reversed in full if the order is refunded" — `Settlements/SettleRefund.php` reverses it in the
 * same transaction that books the refund). `rateLabel` is a display string from the policy that
 * priced the sale; the UI never computes it from the amount.
 */
export interface SellerCommissionRow {
  readonly amount: Money;
  readonly rateLabel: string;
  readonly note: string;
}

export type IneligibilityCode =
  | 'LISTING_NOT_ACTIVE'
  | 'LISTING_RESERVED_BY_OTHER'
  | 'SELF_SALE'
  | 'PRICE_CHANGED_AFTER_QUOTE'
  | 'ORDER_NOT_AWAITING_PAYMENT'
  | 'ORDER_TERMINAL'
  | 'MULTI_ITEM_NOT_SUPPORTED'
  | 'METHOD_NOT_OFFERED'
  | 'UNKNOWN';

export interface MethodDescriptor {
  readonly id: PaymentMethodId;
  readonly label: string;
  readonly blurb: string;
  /** True when card/PAN data is entered only on a provider-hosted surface (CARD, INSTANT_EFT). */
  readonly chargeHappensOnProviderSurface: boolean;
}

export interface PaymentIntentResult {
  readonly intentId: string;
  /** Echoed by the server so the UI can prove a repeat call carried the SAME key. */
  readonly idempotencyKey: string;
  readonly state: PaymentIntentState;
  readonly amount: Money;
  readonly method: PaymentMethodId;
  /** The provider's own reference. The only provider datum this client ever holds. */
  readonly providerReference: string | null;
  readonly failureReason: 'card_declined' | 'eft_cancelled' | null;
}

/**
 * Everything checkout renders, from one endpoint. `order` is the `Orders/Order.php` aggregate;
 * `lastIntent` is the server's memory of the buyer's most recent payment attempt — the browser's
 * own memory is decoration next to it.
 */
export interface CheckoutView {
  readonly orderId: string;
  readonly listingId: string;
  readonly order: OrderView;
  readonly items: readonly CheckoutLineItem[];
  readonly feeRows: readonly FeeRow[];
  readonly sellerCommission: SellerCommissionRow | null;
  readonly methods: readonly MethodDescriptor[];
  readonly ineligibilityCode: IneligibilityCode | null;
  readonly lastIntent: PaymentIntentResult | null;
}

export interface PaymentIntentInput {
  readonly method: PaymentMethodId;
  readonly providerReturnRef: string;
}

export interface CheckoutApi {
  getView(orderId: string): Promise<CheckoutView>;
  createPaymentIntent(orderId: string, input: PaymentIntentInput, idempotencyKey: string): Promise<PaymentIntentResult>;
  getOrder(orderId: string): Promise<OrderView>;
}

export interface CheckoutApiOptions {
  readonly transport: Transport;
  /** Client deadline per request. Injected so the double-charge tests can force a real timeout. */
  readonly timeoutMs?: number;
}

function enc(segment: string): string {
  return encodeURIComponent(segment);
}

/**
 * The transport seam from `@nastech/api-client` is the only network shape this app speaks.
 *
 * `createPaymentIntent` uses `execute`, NOT `executeWithRetry`, on purpose: a keyed POST is
 * replay-safe, but after a timeout the session must move to `resolving` and re-present only under
 * a deliberate user action — an invisible auto-retry would rob the processing screen of the exact
 * truth it exists to show ("we could not confirm; we are checking"). The key makes the re-POST
 * safe when it happens; nothing about it can create a second intent.
 */
export function createCheckoutApi(options: CheckoutApiOptions): CheckoutApi {
  const { transport } = options;
  const timeout = options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {};

  return {
    getView(orderId) {
      return execute<CheckoutView>(transport, {
        method: 'GET',
        path: `/v1/orders/${enc(orderId)}/checkout`,
        ...timeout,
      });
    },

    createPaymentIntent(orderId, input, idempotencyKey) {
      return execute<PaymentIntentResult>(transport, {
        method: 'POST',
        path: `/v1/orders/${enc(orderId)}/payment-intents`,
        body: { orderId, ...input },
        headers: { 'Idempotency-Key': idempotencyKey },
        ...timeout,
      });
    },

    getOrder(orderId) {
      return execute<OrderView>(transport, {
        method: 'GET',
        path: `/v1/orders/${enc(orderId)}`,
        ...timeout,
      });
    },
  };
}
