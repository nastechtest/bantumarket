/**
 * Orders: the state machine as the ledger actually has it, plus the buyer-side mutations.
 *
 * CRITICAL PROVENANCE: the states, events and transitions below are transcribed from
 * `../nastech-market-php/src/Orders/Order.php` (`Order::TRANSITIONS`), `Handover/HandoverToken.php`
 * and `Handover/ConfirmHandover.php` — the tested money path. They are NOT the brief's paraphrase:
 * the brief names `pending_payment → paid → handed_over → completed`, and none of the first or
 * third exist in the ledger. The real path is
 *   AWAITING_PAYMENT → PAID → HANDOVER_SCHEDULED → HANDOVER_CONFIRMED → COMPLETED
 * with CANCELLED, the REFUND_PENDING → REFUNDED pair, and IN_DISPUTE as side states.
 *
 * Two structural facts the UI must not be allowed to "helpfully" work around:
 *   - the only event reaching PAID is PAYMENT_RECORDED (a provider webhook), so this client
 *     exposes no confirm-payment call at all; a handover PIN can never mark an order paid;
 *   - money-bearing events are exactly PAYMENT_RECORDED, ORDER_COMPLETED, REFUND_SETTLED
 *     (`Order::isMoneyBearing`); REFUND_INITIATED opens a refund but moves nothing, which is why
 *     a cancelled refund cannot leave a phantom debit. The client mirrors the vocabulary, so a
 *     future optimistically-rendering UI has fewer invented states to reach for.
 */

import type { Money } from '@nastech/api-contracts';
import { ApiError } from './errors.js';
import { execute, executeWithRetry } from './transport.js';
import type { Transport } from './transport.js';
import type { IdempotencyKeys, IntentId } from './idempotency.js';

export type OrderStatus =
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'HANDOVER_SCHEDULED'
  | 'HANDOVER_CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'IN_DISPUTE';

export type OrderEvent =
  | 'PAYMENT_RECORDED'
  | 'HANDOVER_SCHEDULED'
  | 'HANDOVER_CONFIRMED'
  | 'ORDER_COMPLETED'
  | 'CANCELLED'
  | 'REFUND_INITIATED'
  | 'REFUND_SETTLED'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_RESOLVED_TO_SELLER';

/**
 * Exactly `Order::TRANSITIONS`. Terminal rows (COMPLETED/CANCELLED/REFUNDED) map to `{}` in PHP;
 * they are simply absent as keys of any outgoing edge here, which `TERMINAL_ORDER_STATUSES`
 * spells out. `REFUND_SETTLED` and `PAYMENT_RECORDED`-driven states are webhooks: the client can
 * observe them, never send them.
 */
export const ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, Readonly<Partial<Record<OrderEvent, OrderStatus>>>>
> = {
  AWAITING_PAYMENT: { PAYMENT_RECORDED: 'PAID', CANCELLED: 'CANCELLED' },
  PAID: {
    HANDOVER_SCHEDULED: 'HANDOVER_SCHEDULED',
    REFUND_INITIATED: 'REFUND_PENDING',
    DISPUTE_OPENED: 'IN_DISPUTE',
    CANCELLED: 'CANCELLED',
  },
  HANDOVER_SCHEDULED: {
    HANDOVER_CONFIRMED: 'HANDOVER_CONFIRMED',
    REFUND_INITIATED: 'REFUND_PENDING',
    DISPUTE_OPENED: 'IN_DISPUTE',
  },
  HANDOVER_CONFIRMED: {
    ORDER_COMPLETED: 'COMPLETED',
    REFUND_INITIATED: 'REFUND_PENDING',
    DISPUTE_OPENED: 'IN_DISPUTE',
  },
  REFUND_PENDING: { REFUND_SETTLED: 'REFUNDED' },
  IN_DISPUTE: {
    DISPUTE_RESOLVED_TO_SELLER: 'HANDOVER_CONFIRMED',
    REFUND_INITIATED: 'REFUND_PENDING',
  },
  COMPLETED: {},
  CANCELLED: {},
  REFUNDED: {},
};

/**
 * States with no outgoing edge — `Order::isTerminal`. Derived from the table rather than
 * hand-listed so this constant cannot drift from the transitions it claims to summarise.
 */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = (
  Object.keys(ORDER_TRANSITIONS) as OrderStatus[]
).filter((status) => Object.keys(ORDER_TRANSITIONS[status]).length === 0);

/** Transitions the ledger books into the double-entry ledger — `Order::isMoneyBearing`. */
export const MONEY_BEARING_ORDER_EVENTS: readonly OrderEvent[] = [
  'PAYMENT_RECORDED',
  'ORDER_COMPLETED',
  'REFUND_SETTLED',
];

export function nextOrderStatus(from: OrderStatus, event: OrderEvent): OrderStatus | undefined {
  return ORDER_TRANSITIONS[from][event];
}

export function canApplyOrderEvent(from: OrderStatus, event: OrderEvent): boolean {
  return nextOrderStatus(from, event) !== undefined;
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  // Same test `Order::isTerminal` makes: no outgoing edges at all.
  return Object.keys(ORDER_TRANSITIONS[status]).length === 0;
}

/** The buyer-visible order, shaped from the Order aggregate's public fields. */
export interface OrderView {
  readonly id: string;
  readonly listingId: string;
  readonly buyerId: string;
  readonly sellerId: string;
  readonly category: string;
  readonly itemPrice: Money;
  readonly buyerTotal: Money;
  readonly status: OrderStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly handoverConfirmedAt: string | null;
  readonly completedAt: string | null;
  readonly handoverTokenId: string | null;
}

/**
 * One PIN presentation's outcome — `Handover/ConfirmationResult.php`, verbatim fields.
 * `awaiting` names which party has NOT yet confirmed, and is the only nudge the UI may show;
 * the result deliberately carries nothing that lets either side probe the other's state.
 */
export interface HandoverConfirmation {
  readonly accepted: boolean;
  readonly complete: boolean;
  readonly awaiting: 'buyer' | 'seller' | null;
  readonly attemptsRemaining: number;
  readonly locked: boolean;
}

export interface CreateOrderInput {
  readonly listingId: string;
  readonly buyerTotal: Money;
  /** Per-tap intent id (see `orderIntent`); the key behind it is reused across retries. */
  readonly intent: IntentId;
}

export interface OrdersApiOptions {
  readonly sleep?: (ms: number) => Promise<void>;
  /** Client deadline per request; defaults to DEFAULT_TIMEOUT_MS. Injectable for tests. */
  readonly timeoutMs?: number;
}

export interface OrdersApi {
  getOrder(orderId: string): Promise<OrderView>;
  createOrder(input: CreateOrderInput): Promise<OrderView>;
  scheduleHandover(orderId: string, intent: IntentId, from?: OrderStatus): Promise<OrderView>;
  submitHandoverPin(tokenId: string, pin: string): Promise<HandoverConfirmation>;
  raiseDispute(orderId: string, reason: string, intent: IntentId, from?: OrderStatus): Promise<OrderView>;
  cancelOrder(orderId: string, intent: IntentId, from?: OrderStatus): Promise<OrderView>;
}

const HANDOVER_PIN_PATTERN = /^\d{6}$/;

export function createOrdersApi(
  transport: Transport,
  keys: IdempotencyKeys,
  options: OrdersApiOptions = {},
): OrdersApi {
  async function mutatingPost<TBody, TRes>(
    path: string,
    intent: IntentId,
    body: TBody,
    guard: { readonly event: OrderEvent; readonly from: OrderStatus | undefined } | null,
    sleep: ((ms: number) => Promise<void>) | undefined,
  ): Promise<TRes> {
    // Local guard: if we were told the state we act from, refuse to send an event the ledger
    // would reject. This is the whole point of mirroring TRANSITIONS in types — the UI gets a
    // synchronous, fixable error instead of a 409 the gateway throws after the money raced.
    if (guard !== null && guard.from !== undefined && !canApplyOrderEvent(guard.from, guard.event)) {
      throw new ApiError({ kind: 'validation' });
    }
    const key = keys.keyForIntent(intent);
    try {
      const result = await executeWithRetry<TRes>(
        transport,
        {
          method: 'POST',
          path,
          body,
          headers: { 'Idempotency-Key': key },
          ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        },
        sleep !== undefined ? { sleep } : {},
      );
      keys.releaseIntent(intent);
      return result;
    } catch (error) {
      // A wrong shape or a missing resource will fail identically forever: retire the intent so
      // the next deliberate attempt is a NEW intent with a NEW key. Retryable failures keep the
      // key — the server may have already done the work under it, and resending the same key is
      // the only safe way to find out.
      if (
        error instanceof ApiError &&
        (error.kind === 'validation' || error.kind === 'notFound' || error.kind === 'forbidden')
      ) {
        keys.releaseIntent(intent);
      }
      throw error;
    }
  }

  return {
    getOrder(orderId: string) {
      return execute<OrderView>(transport, {
        method: 'GET',
        path: `/v1/orders/${encodeURIComponent(orderId)}`,
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      });
    },

    createOrder(input: CreateOrderInput) {
      // Creation has no source state in the machine, so there is nothing to guard against
      // locally; the server's preconditions (listing ACTIVE, no self-sale, buyerTotal >= price)
      // come back as `validation`.
      return mutatingPost<{ listingId: string; buyerTotal: Money }, OrderView>(
        '/v1/orders',
        input.intent,
        { listingId: input.listingId, buyerTotal: input.buyerTotal },
        null,
        options.sleep,
      );
    },

    scheduleHandover(orderId: string, intent: IntentId, from?: OrderStatus) {
      // PHP allows the state change only from PAID, but reissue from HANDOVER_SCHEDULED is legal
      // and does not transition (`ScheduleHandover::$isReissue`) — from HANDOVER_SCHEDULED we
      // send the request but skip the transition guard, matching the handler.
      return mutatingPost<{ orderId: string }, OrderView>(
        `/v1/orders/${encodeURIComponent(orderId)}/handover/schedule`,
        intent,
        { orderId },
        { event: 'HANDOVER_SCHEDULED', from },
        options.sleep,
      );
    },

    submitHandoverPin(tokenId: string, pin: string) {
      if (!HANDOVER_PIN_PATTERN.test(pin)) {
        // Message is static per kind (errors.ts), but be explicit in review: never interpolate
        // `pin` anywhere — it is a live money-release precondition.
        throw new ApiError({ kind: 'validation' });
      }
      // NO retry and NO idempotency key here, deliberately: each presentation consumes one of
      // HandoverToken::MAX_ATTEMPTS whether or not the response arrived, so a blind retry of a
      // lost response can lock a legitimate handover out of its own token. The user re-submits
      // as a new request, accepting the attempt cost knowingly.
      // The role is not sent: `ConfirmHandover::handle` derives the actor from the authenticated
      // principal and rejects a body-supplied role — each side must present the PIN themselves.
      return execute<HandoverConfirmation>(transport, {
        method: 'POST',
        path: `/v1/handover-tokens/${encodeURIComponent(tokenId)}/present`,
        body: { pin },
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      });
    },

    raiseDispute(orderId: string, reason: string, intent: IntentId, from?: OrderStatus) {
      return mutatingPost<{ orderId: string; reason: string }, OrderView>(
        `/v1/orders/${encodeURIComponent(orderId)}/dispute`,
        intent,
        { orderId, reason },
        { event: 'DISPUTE_OPENED', from },
        options.sleep,
      );
    },

    cancelOrder(orderId: string, intent: IntentId, from?: OrderStatus) {
      return mutatingPost<{ orderId: string }, OrderView>(
        `/v1/orders/${encodeURIComponent(orderId)}/cancel`,
        intent,
        { orderId },
        { event: 'CANCELLED', from },
        options.sleep,
      );
    },
  };
}
