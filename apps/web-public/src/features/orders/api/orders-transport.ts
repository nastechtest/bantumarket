import type { Money } from '@nastech/api-contracts';
import type { OrderState } from '../state-labels.js';

/**
 * Wire shape of the buyer-visible order row. Field names mirror the Order aggregate's public
 * fields (`nastech-market-php/src/Orders/Order.php`).
 *
 * CONTRACT-GAP: `api-client`'s `OrderView` carries `listingId` but no listing title or poster —
 * an order list would render bare ids. `listingTitle` below is what the list endpoint must
 * embed; it is defined locally so the fence test stays honest about what is assumed.
 */
export interface OrderRow {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly buyerId: string;
  readonly sellerId: string;
  readonly category: string;
  readonly itemPrice: Money;
  readonly buyerTotal: Money;
  readonly status: OrderState;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly handoverConfirmedAt: string | null;
  readonly completedAt: string | null;
  readonly handoverTokenId: string | null;
}

export type OrderRole = 'buyer' | 'seller';

export interface OrderListFilters {
  readonly role: OrderRole;
  readonly includeClosed?: boolean;
}

export interface CancelOutcome {
  readonly order: OrderRow;
  /** True only when the ledger accepted the cancel; the row then carries the new state. */
  readonly cancelled: boolean;
  /** The state the cancel was attempted from — the UI must show honest money copy for it. */
  readonly attemptedFrom?: OrderState;
  readonly reason?: string;
}

/**
 * The transport the orders feature talks to. Deliberately an interface with a fixture
 * implementation: the PHP ledger has no HTTP layer yet (ADR 0002), so every path below is
 * assumed and recorded in README.md, not verified.
 *
 * CONTRACT-GAP: assumed endpoints —
 *   GET  /v1/orders?role=buyer|seller&include_closed=
 *   GET  /v1/orders/{orderId}
 *   POST /v1/orders/{orderId}/cancel   (Idempotency-Key header required, like api-client's OrdersApi)
 * When the gateway lands, an adapter over `createOrdersApi` replaces the fixture without
 * touching a single component.
 */
export interface OrdersTransport {
  listOrders(filters: OrderListFilters): Promise<readonly OrderRow[]>;
  getOrder(orderId: string): Promise<OrderRow>;
  cancelOrder(orderId: string, idempotencyKey: string): Promise<CancelOutcome>;
}
